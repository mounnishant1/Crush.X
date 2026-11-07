"""Offline tests for the read-only AWS Identity/Organizations diagnostic."""
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / "tools" / "identity_503_audit.py"
spec = importlib.util.spec_from_file_location("identity_audit", PATH)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

ACCOUNT = "123456789012"
ROLE = "arn:aws:iam::123456789012:role/test-identity"
TABLE = "test-identity-table"
TABLE_ARN = f"arn:aws:dynamodb:ap-southeast-2:{ACCOUNT}:table/{TABLE}"


def mocked(service, operation, *, profile, region, options=()):
    assert (service, operation) in audit.READS
    fixtures = {
        ("sts", "get-caller-identity"): {"Account": ACCOUNT},
        ("apigatewayv2", "get-routes"): {"Items": [
            {"RouteKey": method, "AuthorizationType": "JWT", "AuthorizerId": "auth",
             "Target": "integrations/integration-1"}
            for method in ("GET /v1/me", "PUT /v1/me/handle")
        ]},
        ("apigatewayv2", "get-integration"): {"IntegrationType": "AWS_PROXY"},
        ("lambda", "get-function-configuration"): {
            "State": "Active", "Role": ROLE,
            "Environment": {"Variables": {"TABLE_NAME": TABLE, "SECRET": "NEVER_INCLUDE_SECRET"}}},
        ("dynamodb", "describe-table"): {"Table": {"TableArn": TABLE_ARN, "TableStatus": "ACTIVE"}},
        ("iam", "get-role-policy"): {"PolicyDocument": {"Statement": [
            {"Effect": "Allow", "Resource": TABLE_ARN,
             "Action": ["dynamodb:GetItem", "dynamodb:TransactWriteItems"]}]}},
        ("iam", "simulate-principal-policy"): {"EvaluationResults": [
            {"EvalActionName": name, "EvalDecision": "explicitDeny",
             "OrganizationsDecisionDetail": {"AllowedByOrganizations": False}}
            for name in audit.ACTIONS]},
    }
    return fixtures[(service, operation)], None


def check(call=mocked, account=ACCOUNT):
    return audit.evaluate(profile="test", region="ap-southeast-2", account=account,
                          api_id="api123", lambda_name="identity", invoke=call)


class IdentityAuditTest(unittest.TestCase):
    def test_organizations_deny_and_sanitized_report(self):
        import json
        result = check()
        self.assertEqual(result["status"], "BLOCKED_SCP_ADMIN_REVIEW")
        self.assertTrue(result["checks"]["jwtRoutes"])
        self.assertTrue(result["checks"]["allowGetItemInInlinePolicy"])
        self.assertTrue(result["checks"]["obsoleteTransactionPermission"])
        self.assertNotIn("NEVER_INCLUDE_SECRET", json.dumps(result))
        self.assertNotIn(ROLE, json.dumps(result))

    def test_account_mismatch_stops_before_resources(self):
        seen = []
        def different(service, operation, **kwargs):
            seen.append((service, operation))
            return {"Account": "999999999999"}, None
        self.assertEqual(check(different)["status"], "ACCOUNT_MISMATCH")
        self.assertEqual(seen, [("sts", "get-caller-identity")])

    def test_readonly_operation_allowlist(self):
        with self.assertRaises(ValueError):
            audit.aws_read("iam", "put-role-policy", profile="test", region="ap-southeast-2")
        with self.assertRaises(ValueError):
            audit.aws_read("dynamodb", "update-item", profile="test", region="ap-southeast-2")
        self.assertNotIn("dynamodb:TransactWriteItems", audit.ACTIONS)

    def test_missing_write_permissions_without_scp_deny(self):
        def missing(service, operation, **kwargs):
            result, error = mocked(service, operation, **kwargs)
            if operation == "simulate-principal-policy":
                result = {"EvaluationResults": [
                    {"EvalActionName": name, "EvalDecision": "allowed" if name == "dynamodb:GetItem" else "implicitDeny",
                     "OrganizationsDecisionDetail": {"AllowedByOrganizations": True}}
                    for name in audit.ACTIONS]}
            return result, error
        self.assertEqual(check(missing)["status"], "BLOCKED_IAM_OR_UNVERIFIED")


if __name__ == "__main__":
    unittest.main()
