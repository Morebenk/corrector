import logging
import pandas as pd
from sqlalchemy import text

logger = logging.getLogger(__name__)

def get_all_files(engine):
    try:
        with engine.connect() as conn:
            query = text("""
                SELECT DISTINCT file_path FROM questions
                UNION
                SELECT DISTINCT file_path FROM duplicates
                ORDER BY file_path
            """)
            df = pd.read_sql_query(query, conn)
            return df['file_path'].tolist()
    except Exception as e:
        logger.exception("Error fetching all files")
        return {'error': str(e)}