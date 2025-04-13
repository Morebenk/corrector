import os
from dotenv import load_dotenv
load_dotenv()

class Config:
    SUPABASE_USER = os.environ.get("SUPABASE_USER")
    SUPABASE_PASSWORD = os.environ.get("SUPABASE_PASSWORD")
    SUPABASE_HOST = os.environ.get("SUPABASE_HOST")
    SUPABASE_PORT = os.environ.get("SUPABASE_PORT")
    SUPABASE_DBNAME = os.environ.get("SUPABASE_DBNAME")
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
    AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
    AWS_REGION = os.environ.get('AWS_REGION')
    S3_BUCKET = os.environ.get('S3_BUCKET')
    CLOUDFRONT_DOMAIN = os.environ.get('CLOUDFRONT_DOMAIN')

    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set")
    if not SUPABASE_PASSWORD:
        raise ValueError("SUPABASE_PASSWORD is not set")

    SQLALCHEMY_DATABASE_URI = (
        f"postgresql+psycopg2://{SUPABASE_USER}:{SUPABASE_PASSWORD}@"
        f"{SUPABASE_HOST}:{SUPABASE_PORT}/{SUPABASE_DBNAME}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False