#!/usr/bin/env python3
"""Read-only Crush.X Identity AWS permission audit. Requires AWS CLI; no AWS writes."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

READS = {
    ("sts", "get-caller-identity"),
    ("apigatewayv2", "get-routes"),
    ("apigatewayv2", "get-integration"),
    ("lambda", "get-function-configuration"),
    ("dynamodb", "describe-table"),
    ("iam", "get-role-policy"),
    ("iam", "simulate-principal-policy"),
}
ACTIONS = ("dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query")
SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]+$")


def aws_read(service, action, *, profile, region, options=()):
    if (service, action) not in READS:
        raise ValueError("READ_ONLY_AWS_OPERATION_REQUIRED")
    command = ["aws", service, action, "--profile", profile, "--region", region, *options,
               "--no-cli-pager", "--output", "json"]
    try:
        completed = subprocess.run(command, timeout=30, capture_output=True, text=True, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {}, type(exc).__name__
    if completed.returncode:
        match = re.search(r"\\(([A-Za-z][A-Za-z0-9]+)\\) when calling", completed.stderr)
        return {}, match.group(1) if match else "AWS_COMMAND_FAILED"
    try:
        result = json.loads(completed.stdout)
    except (TypeError, ValueError):
        return {}, "INVALID_AWS_RESPONSE"
    return (result, None) if isinstance(result, dict) else ({}, "INVALID_AWS_RESPONSE")


def listify(value):
    return value if isinstance(value, list) else ([] if value is None else [value])


def evaluate(*, profile, region, account, api_id, lambda_name, invoke=aws_read):
    report = {"schema": "crushx.identity-permission-audit.v1", "readOnly": True,
              "status": "BLOCKED_UNVERIFIED", "region": region,
              "checks": {}, "errors": []}
    def read(label, service, operation, *options):
        result, error = invoke(service, operation, profile=profile, region=region, options=options)
        if error:
            report["errors"].append({"check": label, "code": error})
        return result

    identity = read("identity", "sts", "get-caller-identity")
    if identity.get("Account") != account:
        report["status"] = "ACCOUNT_MISMATCH"
        return report

    routes = read("routes", "apigatewayv2", "get-routes", "--api-id", api_id)
    keys = ("GET /v1/me", "PUT /v1/me/handle")
    matched = {r.get("RouteKey"): r for r in listify(routes.get("Items")) if isinstance(r, dict) and r.get("RouteKey") in keys}
    good_routes = len(matched) == len(keys) and all(
        matched[key].get("AuthorizationType") == "JWT" and matched[key].get("AuthorizerId")
        for key in keys if key in matched)
    targets = {v.get("Target") for v in matched.values()}
    report["checks"]["jwtRoutes"] = bool(good_routes)
    if not good_routes or len(targets) != 1:
        return report
    target = targets.pop()
    if not isinstance(target, str) or not target.startswith("integrations/"):
        return report
    integration = read("integration", "apigatewayv2", "get-integration", "--api-id", api_id,
                       "--integration-id", target.partition("/")[2])
    report["checks"]["lambdaIntegration"] = integration.get("IntegrationType") == "AWS_PROXY"

    configuration = read("lambda", "lambda", "get-function-configuration", "--function-name", lambda_name)
    report["checks"]["lambdaActive"] = configuration.get("State") == "Active"
    role = configuration.get("Role") or ""
    table = (configuration.get("Environment") or {}).get("Variables", {}).get("TABLE_NAME")
    if (not isinstance(role, str) or not role.startswith(f"arn:aws:iam::{account}:role/") or
            not isinstance(table, str) or not SAFE_ID.fullmatch(table)):
        report["errors"].append({"check": "resources", "code": "ROLE_OR_TABLE_UNAVAILABLE"})
        return report

    description = read("table", "dynamodb", "describe-table", "--table-name", table).get("Table") or {}
    table_arn = description.get("TableArn") or ""
    report["checks"]["tableActive"] = description.get("TableStatus") == "ACTIVE"
    if not table_arn.startswith(f"arn:aws:dynamodb:{region}:{account}:table/"):
        return report

    role_name = role.rsplit("/", 1)[-1]
    if not SAFE_ID.fullmatch(role_name):
        return report
    policy = read("inline-policy", "iam", "get-role-policy",
                  "--role-name", role_name, "--policy-name", "IdentityDatabaseLeastPrivilege")
    doc = policy.get("PolicyDocument") or {}
    if isinstance(doc, str):
        try:
            from urllib.parse import unquote
            doc = json.loads(unquote(doc))
        except (ValueError, TypeError):
            doc = {}
    allowed = set()
    for statement in listify(doc.get("Statement")) if isinstance(doc, dict) else []:
        if not isinstance(statement, dict) or statement.get("Effect") != "Allow":
            continue
        if table_arn not in listify(statement.get("Resource")) and "*" not in listify(statement.get("Resource")):
            continue
        allowed.update(str(a) for a in listify(statement.get("Action")))
    report["checks"]["allowGetItemInInlinePolicy"] = "dynamodb:GetItem" in allowed or "dynamodb:*" in allowed
    report["checks"]["allowWriteInInlinePolicy"] = any(a in allowed for a in ("dynamodb:PutItem", "dynamodb:UpdateItem"))
    report["checks"]["obsoleteTransactionPermission"] = "dynamodb:TransactWriteItems" in allowed

    simulation = read("simulation", "iam", "simulate-principal-policy",
                      "--policy-source-arn", role, "--action-names", *ACTIONS, "--resource-arns", table_arn)
    results = [r for r in listify(simulation.get("EvaluationResults")) if isinstance(r, dict)]
    decisions = {r.get("EvalActionName"): r.get("EvalDecision") for r in results}
    blocked_by_org = any((r.get("OrganizationsDecisionDetail") or {}).get("AllowedByOrganizations") is False for r in results)
    report["checks"]["decisions"] = decisions
    report["checks"]["organizationsBlocks"] = blocked_by_org
    if blocked_by_org:
        report["status"] = "BLOCKED_SCP_ADMIN_REVIEW"
    elif any(v != "allowed" for v in decisions.values()) or len(decisions) != len(ACTIONS):
        report["status"] = "BLOCKED_IAM_OR_UNVERIFIED"
    elif report["errors"]:
        report["status"] = "BLOCKED_UNVERIFIED"
    else:
        report["status"] = "SIMULATED_ALLOW_LIVE_TEST_REQUIRED"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ("profile", "region", "account", "api-id", "lambda-name"):
        parser.add_argument("--" + field, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    values = (args.profile, args.region, args.account, args.api_id, args.lambda_name)
    if not all(SAFE_ID.fullmatch(v) for v in values) or not re.fullmatch(r"\\d{12}", args.account):
        parser.error("Invalid AWS identifier")
    result = evaluate(profile=args.profile, region=args.region, account=args.account,
                      api_id=args.api_id, lambda_name=args.lambda_name)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(result["status"])
    print("Report:", args.output)
    return 0 if result["status"] == "SIMULATED_ALLOW_LIVE_TEST_REQUIRED" else 1


if __name__ == "__main__":
    sys.exit(main())
