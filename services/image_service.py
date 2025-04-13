import boto3
import logging
import os
import uuid
from werkzeug.utils import secure_filename
from config import Config
from sqlalchemy import text
from cachetools import TTLCache

logger = logging.getLogger(__name__)

# Cache for 5 minutes to reduce DB hits
cache = TTLCache(maxsize=100, ttl=300)

def handle_image(engine, question_id, request):
    s3 = None
    bucket_name = Config.S3_BUCKET
    cloudfront_domain = Config.CLOUDFRONT_DOMAIN

    if request.method == 'POST':
        if request.is_json:
            data = request.get_json()
            image_url = data.get('image_url')
            if not image_url:
                return {'error': 'No image URL provided'}
            try:
                with engine.begin() as conn:
                    conn.execute(text("""
                        UPDATE enhanced_questions
                        SET image_url = :image_url, requires_image = TRUE
                        WHERE id = :question_id
                    """), {'question_id': question_id, 'image_url': image_url})
                return {'image_url': image_url}
            except Exception as e:
                logger.exception(f"Error updating image URL: {str(e)}")
                return {'error': str(e)}
        else:
            if 'image' not in request.files:
                return {'error': 'No image file provided'}
            file = request.files['image']
            if file.filename == '':
                return {'error': 'No file selected'}
            try:
                filename = secure_filename(file.filename)
                file_ext = os.path.splitext(filename)[1]
                unique_filename = f"question_{question_id}_{uuid.uuid4().hex}{file_ext}"
                s3 = boto3.client(
                    's3',
                    aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY,
                    region_name=Config.AWS_REGION
                )
                s3.upload_fileobj(
                    file,
                    bucket_name,
                    f"question_images/{unique_filename}",
                    ExtraArgs={'ContentType': file.content_type}
                )
                image_url = (f"https://{cloudfront_domain}/question_images/{unique_filename}"
                            if cloudfront_domain else
                            f"https://{bucket_name}.s3.amazonaws.com/question_images/{unique_filename}")
                with engine.begin() as conn:
                    conn.execute(text("""
                        UPDATE enhanced_questions
                        SET image_url = :image_url, requires_image = TRUE
                        WHERE id = :question_id
                    """), {'question_id': question_id, 'image_url': image_url})
                return {'image_url': image_url}
            except Exception as e:
                logger.exception(f"Error uploading image: {str(e)}")
                return {'error': str(e)}
    elif request.method == 'DELETE':
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    UPDATE enhanced_questions
                    SET image_url = NULL
                    WHERE id = :question_id
                """), {'question_id': question_id})
            return {}
        except Exception as e:
            logger.exception(f"Error handling image deletion: {str(e)}")
            return {'error': str(e)}

def get_image_files(engine):
    cache_key = 'image_files'
    if cache_key in cache:
        return cache[cache_key]
    try:
        with engine.connect() as conn:
            query = text("""
                SELECT DISTINCT source_file 
                FROM public.extracted_images
                ORDER BY source_file
            """)
            result = conn.execute(query)
            files = [row[0] for row in result]
            result = {'files': files}
            cache[cache_key] = result
            return result
    except Exception as e:
        logger.exception("Error getting image files")
        return {'error': str(e)}

def get_file_images(engine, args):
    file_path = args.get('file_path')
    page_number = args.get('page_number', type=int)
    question_number = args.get('question_number', type=int)  # For highlighting
    if not file_path:
        return {'error': 'Missing file_path parameter'}
    
    cache_key = f"images_{file_path}_{page_number}_{question_number}"
    if cache_key in cache:
        return cache[cache_key]
    
    try:
        with engine.connect() as conn:
            query = text("""
                SELECT id, source_file, page_number, image_path, s3_url, question_number
                FROM public.extracted_images
                WHERE source_file = :source_file
            """)
            params = {'source_file': file_path}
            if page_number is not None:
                query = text(query.text + " AND page_number = :page_number")
                params['page_number'] = page_number
            query = text(query.text + " ORDER BY question_number NULLS LAST, image_path")
            result = conn.execute(query, params)
            images = [{
                'id': row.id,
                'source_file': row.source_file,
                'page_number': row.page_number,
                'image_path': row.image_path,
                'url': row.s3_url,
                'question_number': row.question_number,
                'is_question_image': question_number is not None and row.question_number == question_number
            } for row in result]
            
            result = {
                'images': images,
                'file_path': file_path,
                'page_number': page_number if page_number is not None else None
            }
            cache[cache_key] = result
            return result
    except Exception as e:
        logger.exception(f"Error getting file images for {file_path}")
        return {'error': str(e)}


def get_page_images(engine, args):
    file_path = args.get('file_path')
    page_number = args.get('page_number')
    question_number = args.get('question_number', type=int)
    if not file_path or not page_number:
        return {'error': 'Missing file_path or page_number parameter'}
    
    cache_key = f"page_images_{file_path}_{page_number}_{question_number}"
    if cache_key in cache:
        return cache[cache_key]
    
    try:
        page_number = int(page_number)
        with engine.connect() as conn:
            # Normalize file path for matching
            file_variations = [file_path]
            # Add short form (e.g., 'rafi3-10') if full path is provided
            if file_path.startswith('jsons/'):
                short_name = file_path.split('/')[-1].replace('.json', '')
                file_variations.append(short_name)
            
            images = []
            matched_file = None
            for variation in file_variations:
                query = text("""
                    SELECT id, source_file, page_number, image_path, s3_url, question_number
                    FROM public.extracted_images
                    WHERE source_file = :source_file AND page_number = :page_number
                    ORDER BY question_number NULLS LAST, image_path
                """)
                result = conn.execute(query, {'source_file': variation, 'page_number': page_number})
                images = [{
                    'id': row.id,
                    'source_file': row.source_file,
                    'page_number': row.page_number,
                    'image_path': row.image_path,
                    'url': row.s3_url,
                    'question_number': row.question_number,
                    'is_question_image': question_number is not None and row.question_number == question_number
                } for row in result]
                
                if images:
                    matched_file = variation
                    logger.info(f"Found {len(images)} images for file {variation}, page {page_number}")
                    break
            
            if images:
                result = {
                    'images': images,
                    'page_number': page_number,
                    'file_path': matched_file,
                    'original_query_path': file_path if matched_file != file_path else None
                }
                cache[cache_key] = result
                return result
            
            # Log failure
            logger.warning(f"No images found for file variations {file_variations}, page {page_number}")
            # Debug: List available files
            debug_query = text("SELECT DISTINCT source_file FROM public.extracted_images ORDER BY source_file")
            debug_result = conn.execute(debug_query)
            logger.debug(f"Available source files: {[row.source_file for row in debug_result]}")
            
            # Return available pages for the requested file
            available_pages_query = text("""
                SELECT DISTINCT page_number
                FROM public.extracted_images
                WHERE source_file = :source_file
                ORDER BY page_number
            """)
            result = conn.execute(available_pages_query, {'source_file': file_path})
            available_pages = [row.page_number for row in result]
            result = {
                'images': [],
                'page_number': page_number,
                'available_pages': available_pages,
                'file_path': file_path,
                'error': f'No images found for {file_path}, page {page_number}'
            }
            cache[cache_key] = result
            return result
    except Exception as e:
        logger.exception(f"Error getting page images for {file_path}, page {page_number}")
        return {'error': str(e)}


def get_available_pages(engine, file_path):
    cache_key = f"available_pages_{file_path}"
    if cache_key in cache:
        return cache[cache_key]
    
    try:
        with engine.connect() as conn:
            file_variations = [file_path]
            if file_path.startswith('jsons/'):
                short_name = file_path.split('/')[-1].replace('.json', '')
                file_variations.append(short_name)
            
            pages = []
            for variation in file_variations:
                query = text("""
                    SELECT DISTINCT page_number
                    FROM public.extracted_images
                    WHERE source_file = :source_file
                    ORDER BY page_number
                """)
                result = conn.execute(query, {'source_file': variation})
                pages = [row.page_number for row in result]
                if pages:
                    break
            
            result = {'pages': pages}
            cache[cache_key] = result
            return result
    except Exception as e:
        logger.exception(f"Error getting available pages for {file_path}")
        return {'error': str(e)}
    
    