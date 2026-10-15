"""Verify inventory uses read methods and excludes credential-bearing fields."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).parents[1]/'tools'/'aws_inventory.py'
spec=importlib.util.spec_from_file_location('inventory',SCRIPT)
inventory=importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)

class InventoryTest(unittest.TestCase):
    def test_reads_only_and_redacts_secrets(self):
        calls=[]
        class Service:
            def __init__(self,name):self.name=name
            def __getattr__(self,method):
                if not method.startswith(('list_','get_','describe_')):raise AssertionError('Mutation attempted: '+method)
                def invoke(**kwargs):
                    calls.append((self.name,method))
                    results={
                      ('lambda','list_functions'):{'Functions':[{'FunctionName':'existing-function','FunctionArn':'arn:lambda:existing','Environment':{'Variables':{'SECRET':'MUST_NOT_APPEAR'}},'Code':{'Location':'SIGNED_URL_MUST_NOT_APPEAR'}}]},
                      ('cognito-idp','list_user_pools'):{'UserPools':[{'Id':'ap-south-1_existing','Name':'existing-pool'}]},
                      ('cognito-idp','list_user_pool_clients'):{'UserPoolClients':[{'ClientId':'existing-client'}]},
                      ('cognito-idp','describe_user_pool_client'):{'UserPoolClient':{'ClientId':'existing-client','ClientSecret':'CLIENT_SECRET_MUST_NOT_APPEAR'}},
                      ('apigateway','get_rest_apis'):{'items':[{'id':'existing-api','name':'Existing'}]},
                      ('apigateway','get_resources'):{'items':[{'id':'resource','path':'/media/upload-url','resourceMethods':{'POST':{}}}]},
                      ('apigateway','get_method'):{'authorizationType':'COGNITO_USER_POOLS','methodIntegration':{'type':'AWS_PROXY','uri':'arn:lambda:existing'}},
                      ('apigatewayv2','get_apis'):{'Items':[]},
                      ('cloudformation','list_stacks'):{'StackSummaries':[{'StackName':'old','StackStatus':'DELETE_COMPLETE'},{'StackName':'existing','StackStatus':'CREATE_COMPLETE'}]},
                      ('dynamodb','list_tables'):{'TableNames':['existing-table']},
                      ('s3','list_buckets'):{'Buckets':[{'Name':'existing-bucket'}]}
                    }
                    return results.get((self.name,method),{})
                return invoke
        class Session:
            def __init__(self,**kwargs):pass
            def get_credentials(self):return object()
            def client(self,name,**kwargs):return Service(name)
        fake=SimpleNamespace(Session=Session)
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'inventory.json'
            modules={'boto3':fake,'botocore':SimpleNamespace(),'botocore.exceptions':SimpleNamespace(ClientError=type('ClientError',(Exception,),{}))}
            with patch.dict('sys.modules',modules),patch('sys.argv',['inventory','--regions','ap-south-1','--output',str(output)]):
                self.assertEqual(inventory.main(),0)
            content=output.read_text()
            for forbidden in ['MUST_NOT_APPEAR','Environment','ClientSecret','SIGNED_URL']:
                self.assertNotIn(forbidden,content)
            report=json.loads(content)
            self.assertEqual(report['regions']['ap-south-1']['restApis'][0]['routes'][0]['authorizationType'],'COGNITO_USER_POOLS')
            self.assertEqual(len(report['regions']['ap-south-1']['cloudformation']),1)
            self.assertTrue(calls)

    def test_invalid_profile_reports_type_without_secret_values(self):
        class BrokenSession:
            def __init__(self,**kwargs):raise RuntimeError('sensitive-value-must-not-appear')
        import io
        output=io.StringIO()
        modules={'boto3':SimpleNamespace(Session=BrokenSession),'botocore':SimpleNamespace(),'botocore.exceptions':SimpleNamespace(ClientError=type('ClientError',(Exception,),{}))}
        with patch.dict('sys.modules',modules),patch('sys.argv',['inventory','--output','unused.json']),patch('sys.stderr',output):
            self.assertEqual(inventory.main(),2)
        self.assertNotIn('sensitive-value',output.getvalue())
        self.assertIn('RuntimeError',output.getvalue())

    def test_denied_metadata_returns_partial_failure(self):
        class Denied(Exception):
            response={'Error':{'Code':'AccessDenied'}}
        class Service:
            def __getattr__(self,name):
                def read(**kwargs):
                    if name=='list_functions':raise Denied()
                    return {}
                return read
        class Session:
            def __init__(self,**kwargs):pass
            def get_credentials(self):return object()
            def client(self,*args,**kwargs):return Service()
        modules={'boto3':SimpleNamespace(Session=Session),'botocore':SimpleNamespace(),'botocore.exceptions':SimpleNamespace(ClientError=Denied)}
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'partial.json'
            with patch.dict('sys.modules',modules),patch('sys.argv',['inventory','--regions','ap-south-1','--output',str(output)]):
                self.assertEqual(inventory.main(),1)
            self.assertEqual(json.loads(output.read_text())['errors'][0]['code'],'AccessDenied')

if __name__=='__main__':unittest.main()
