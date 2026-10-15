#!/usr/bin/env python3
"""Read-only AWS metadata inventory. Never deploys or retrieves secret values.
Use an existing IAM role or securely configured SDK profile. Output identifiers only.
"""
import argparse
import json
from pathlib import Path
import sys


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--regions',nargs='+',default=['ap-south-1','us-west-2'])
    parser.add_argument('--profile',help='An existing SDK profile; omit for the configured role')
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    try:
        import boto3
        from botocore.exceptions import ClientError
    except ImportError:
        print('Install boto3 to use the read-only inventory tool.',file=sys.stderr)
        return 2
    try:
        session=boto3.Session(profile_name=args.profile)
        credentials=session.get_credentials()
    except Exception as error:
        print('AWS credential setup is unavailable: '+type(error).__name__,file=sys.stderr)
        return 2
    if credentials is None:
        print('No configured AWS role or SDK credentials. Configure access securely; do not paste keys into chat.',file=sys.stderr)
        return 2
    report={'regions':{},'errors':[]}
    def read(region,service,operation,**kwargs):
        try:
            return getattr(session.client(service,region_name=region),operation)(**kwargs)
        except ClientError as e:
            report['errors'].append({'region':region,'service':service,'operation':operation,'code':e.response.get('Error',{}).get('Code','Unknown')})
        except Exception as e:
            report['errors'].append({'region':region,'service':service,'operation':operation,'type':type(e).__name__})
        return {}
    def pages(region,service,operation,key,token_arg='NextToken',token_key='NextToken',**kwargs):
        result=[]
        while True:
            data=read(region,service,operation,**kwargs);result+=data.get(key,[])
            token=data.get(token_key)
            if not token:break
            kwargs[token_arg]=token
        return result
    for region in args.regions:
        item={};report['regions'][region]=item
        functions=pages(region,'lambda','list_functions','Functions',token_arg='Marker',token_key='NextMarker')
        # Lambda environment variables and signed code-download URLs are excluded.
        item['lambda']=[{k:f.get(k) for k in ('FunctionName','FunctionArn','Runtime','Handler','LastModified','CodeSha256')} for f in functions]
        rest=pages(region,'apigateway','get_rest_apis','items',token_arg='position',token_key='position',limit=500)
        item['restApis']=[]
        for api in rest:
            api_id=api['id']
            entry={'id':api_id,'name':api.get('name')}
            entry['stages']=[s['stageName'] for s in read(region,'apigateway','get_stages',restApiId=api_id).get('item',[])]
            entry['authorizers']=[{k:a.get(k) for k in ('id','name','type','providerARNs','identitySource')} for a in read(region,'apigateway','get_authorizers',restApiId=api_id).get('items',[])]
            resources=pages(region,'apigateway','get_resources','items',token_arg='position',token_key='position',restApiId=api_id,limit=500)
            entry['routes']=[]
            for resource in resources:
                for method in resource.get('resourceMethods',{}):
                    config=read(region,'apigateway','get_method',restApiId=api_id,resourceId=resource['id'],httpMethod=method)
                    integration=config.get('methodIntegration',{})
                    entry['routes'].append({'path':resource.get('path'),'method':method,'authorizationType':config.get('authorizationType'),'authorizerId':config.get('authorizerId'),'integrationType':integration.get('type'),'integrationUri':integration.get('uri')})
            item['restApis'].append(entry)
        http=pages(region,'apigatewayv2','get_apis','Items',MaxResults='100')
        item['httpApis']=[]
        for api in http:
            api_id=api['ApiId']
            entry={'id':api_id,'name':api.get('Name'),'protocol':api.get('ProtocolType'),'endpoint':api.get('ApiEndpoint')}
            entry['stages']=[s['StageName'] for s in pages(region,'apigatewayv2','get_stages','Items',ApiId=api_id)]
            entry['routes']=[{k:r.get(k) for k in ('RouteKey','AuthorizationType','AuthorizerId','Target')} for r in pages(region,'apigatewayv2','get_routes','Items',ApiId=api_id)]
            entry['integrations']=[{k:i.get(k) for k in ('IntegrationId','IntegrationType','IntegrationUri')} for i in pages(region,'apigatewayv2','get_integrations','Items',ApiId=api_id)]
            entry['authorizers']=[{k:a.get(k) for k in ('AuthorizerId','Name','AuthorizerType','IdentitySource','JwtConfiguration')} for a in pages(region,'apigatewayv2','get_authorizers','Items',ApiId=api_id)]
            item['httpApis'].append(entry)
        pools=pages(region,'cognito-idp','list_user_pools','UserPools',MaxResults=60)
        item['cognito']=[]
        for pool in pools:
            entry={'id':pool['Id'],'name':pool.get('Name'),'clients':[]}
            clients=pages(region,'cognito-idp','list_user_pool_clients','UserPoolClients',UserPoolId=pool['Id'],MaxResults=60)
            for client in clients:
                config=read(region,'cognito-idp','describe_user_pool_client',UserPoolId=pool['Id'],ClientId=client['ClientId']).get('UserPoolClient',{})
                # ClientSecret must never appear in the report.
                entry['clients'].append({k:config.get(k) for k in ('ClientId','ClientName','ExplicitAuthFlows','AllowedOAuthFlows','AllowedOAuthScopes','CallbackURLs')})
            item['cognito'].append(entry)
        item['cloudformation']=[{k:s.get(k) for k in ('StackName','StackId','StackStatus')} for s in pages(region,'cloudformation','list_stacks','StackSummaries') if s.get('StackStatus')!='DELETE_COMPLETE']
        item['dynamodbTables']=pages(region,'dynamodb','list_tables','TableNames',token_arg='ExclusiveStartTableName',token_key='LastEvaluatedTableName')
    # Bucket names only, no object enumeration or downloads.
    report['s3Buckets']=[{'name':b['Name']} for b in read(args.regions[0],'s3','list_buckets').get('Buckets',[])]
    path=Path(args.output)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,indent=2))
    print(f'Read-only metadata saved to {path}. No resources or production data changed.')
    if report['errors']:
        print('Inventory is partial: some AWS metadata reads failed. See errors in the report.',file=sys.stderr)
        return 1
    return 0

if __name__=='__main__':
    raise SystemExit(main())
