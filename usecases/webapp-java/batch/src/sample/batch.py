import boto3
import datetime
import json
import os
import sys
import psycopg2

s3 = boto3.resource('s3')

ENDPOINT=os.environ['DB_ENDPOINT']
PORT="5432"
USER=os.environ['DB_USERNAME']
PASS=os.environ['DB_PASSWORD']
DBNAME="postgres"

JOB_ID=os.environ['JOB_ID']
BUCKET_NAME=os.environ['BUCKET_NAME']

KEYS = ('id', 'name', 'job0001_flag', 'job0002_flag', 'job0003_flag', 'job0004_flag', 'job0005_flag')

CHECK_ERROR_QUERIES={
    "Job0001": """SELECT name FROM sampleapp_table WHERE job0001_flag = false;""",
    "Job0002": """SELECT name FROM sampleapp_table WHERE job0002_flag = false;""",
    "Job0003": """SELECT name FROM sampleapp_table WHERE job0003_flag = false;""",
    "Job0004": """SELECT name FROM sampleapp_table WHERE job0004_flag = false;""",
    "Job0005": """SELECT name FROM sampleapp_table WHERE job0005_flag = false;""",
}

TODAY = datetime.date.today()

def datetime_encoder(datetime_object):
    if isinstance(datetime_object, datetime.date):
        return datetime_object.isoformat()

try:
    conn = psycopg2.connect(host=ENDPOINT, port=PORT, database=DBNAME, user=USER, password=PASS, sslmode='verify-full', sslrootcert = './root.pem')
    cur = conn.cursor()
    cur.execute(CHECK_ERROR_QUERIES[JOB_ID])
    query_results = cur.fetchall()
    ret = []
    for qresult in query_results:
        ret.append({key:value for key, value in zip(KEYS, qresult)})
except Exception as e:
    print("Database connection failed due to {}".format(e))                
                
if len(query_results) > 0:
    try:
        key_name = "{0}_failure_result_{1}.json".format(JOB_ID, str(TODAY))
        s3_obj = s3.Object(BUCKET_NAME, key_name)
        s3_obj.put(Body=json.dumps(ret, ensure_ascii=False, default=datetime_encoder), ContentEncoding='utf-8', ContentType='application/json')
        print("Job was failed. Please check the failure records in {0}/{1}".format(BUCKET_NAME, key_name))
    except Exception as e:
        print("Couldn't put object to S3: {}".format(e))
    
    sys.exit(1)

else:
    print("Job was success!")
    sys.exit(0)