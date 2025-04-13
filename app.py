#!/usr/bin/env python
import logging
from flask import Flask
from sqlalchemy import create_engine
from config import Config

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config.from_object(Config)
    
    # Create standalone SQLAlchemy engine
    DATABASE_URL = (
        f"postgresql+psycopg2://{Config.SUPABASE_USER}:{Config.SUPABASE_PASSWORD}@"
        f"{Config.SUPABASE_HOST}:{Config.SUPABASE_PORT}/{Config.SUPABASE_DBNAME}"
    )
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
    
    # Import and register routes, passing the engine
    from routes import init_routes
    init_routes(app, engine)
    
    return app

# Create the app instance for Gunicorn
app = create_app()

if __name__ == "__main__":
    app.run(debug=True)