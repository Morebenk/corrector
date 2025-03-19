#!/usr/bin/env python
import os
import logging
from flask import Flask, jsonify, request, send_from_directory, make_response
import hashlib
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from google import genai
from dotenv import load_dotenv

# Load environment variables from a .env file if present
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration: use environment variables or hardcode for testing (replace with your secure credentials)
SUPABASE_USER = os.environ.get("SUPABASE_USER")
SUPABASE_PASSWORD = os.environ.get("SUPABASE_PASSWORD")
SUPABASE_HOST = os.environ.get("SUPABASE_HOST")
SUPABASE_PORT = os.environ.get("SUPABASE_PORT")
SUPABASE_DBNAME = os.environ.get("SUPABASE_DBNAME")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not set")
if not SUPABASE_PASSWORD:
    raise ValueError("SUPABASE_PASSWORD is not set")

# Initialize the Gemini API client
client = genai.Client(api_key=GEMINI_API_KEY)

app = Flask(__name__, static_url_path='', static_folder='.')

# Build the SQLAlchemy database URL
DATABASE_URL = f"postgresql+psycopg2://{SUPABASE_USER}:{SUPABASE_PASSWORD}@{SUPABASE_HOST}:{SUPABASE_PORT}/{SUPABASE_DBNAME}"
# Create an engine with connection pooling and pre-ping for robustness
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)

@app.route('/')
def index():
    try:
        return send_from_directory('.', 'dashboard.html')
    except Exception as e:
        logger.exception("Error serving dashboard.html")
        return jsonify({'error': 'Dashboard not found'}), 404


@app.route('/api/questions', methods=['GET'])
def get_questions():
    # Get the optional file_path filter from query parameters
    file_path_filter = request.args.get('file_path')
    
    try:
        with engine.connect() as conn:
            if file_path_filter:
                # Optimized query to get only enhanced questions that appear in the selected file
                # with their correct array_order, sorted by array_order
                file_filtered_query = text("""
                    -- Get only the enhanced questions that have representatives in the specified file
                    SELECT 
                        eq.id,
                        eq.question_id,
                        eq.enhanced_text,
                        eq.category,
                        eq.status,
                        eq.requires_image,
                        eq.image_url,
                        COALESCE(q_direct.array_order, d.array_order) as array_order,
                        CASE 
                            WHEN q_direct.id IS NOT NULL THEN 'direct'
                            ELSE 'duplicate'
                        END as source_type,
                        q.file_path AS representative_file_path,
                        COUNT(DISTINCT vr.model_name) AS models_count,
                        SUM(CASE WHEN vr.matches_expected IS TRUE THEN 1 ELSE 0 END) AS matching_models
                    FROM enhanced_questions eq
                    JOIN questions q ON q.id = eq.question_id
                    JOIN verification_results vr ON eq.id = vr.question_id
                    -- Look for direct questions in this file
                    LEFT JOIN questions q_direct ON 
                        q_direct.id = eq.question_id AND 
                        q_direct.file_path = :file_path
                    -- Look for this as a representative of duplicates in this file
                    LEFT JOIN duplicates d ON 
                        d.representative_id = eq.question_id AND 
                        d.file_path = :file_path
                    WHERE 
                        q_direct.id IS NOT NULL OR d.representative_id IS NOT NULL
                    GROUP BY 
                        eq.id, eq.question_id, eq.enhanced_text, eq.category, eq.status, 
                        eq.requires_image, eq.image_url, q.file_path, 
                        q_direct.array_order, d.array_order, q_direct.id
                    ORDER BY 
                        COALESCE(q_direct.array_order, d.array_order)
                """)
                
                df = pd.read_sql_query(file_filtered_query, conn, params={'file_path': file_path_filter})
                logger.info(f"Optimized query returned {len(df)} enhanced questions for file {file_path_filter}")
                
            else:
                # No file filter - get all questions
                # Here we don't sort by status anymore, just by ID as a default order
                main_query = text("""
                    SELECT 
                        eq.id,
                        eq.question_id,
                        eq.enhanced_text,
                        eq.category,
                        eq.status,
                        eq.requires_image,
                        eq.image_url,
                        q.file_path AS representative_file_path,
                        COUNT(DISTINCT vr.model_name) AS models_count,
                        SUM(CASE WHEN vr.matches_expected IS TRUE THEN 1 ELSE 0 END) AS matching_models
                    FROM enhanced_questions eq
                    JOIN questions q ON q.id = eq.question_id
                    JOIN verification_results vr ON eq.id = vr.question_id
                    GROUP BY eq.id, eq.question_id, eq.enhanced_text, eq.category, eq.status, eq.requires_image, eq.image_url, q.file_path
                    ORDER BY eq.id
                """)
                df = pd.read_sql_query(main_query, conn)
            
            # Get all available file paths for the dropdown
            all_files_query = text("""
                -- Get all files with questions that have enhanced versions
                SELECT DISTINCT q.file_path 
                FROM questions q
                JOIN enhanced_questions eq ON q.id = eq.question_id
                
                UNION
                
                -- Get all files with duplicates that have enhanced representatives
                SELECT DISTINCT d.file_path
                FROM duplicates d
                JOIN enhanced_questions eq ON d.representative_id = eq.question_id
                
                ORDER BY file_path
            """)
            
            all_files_df = pd.read_sql_query(all_files_query, conn)
            all_file_paths = all_files_df['file_path'].tolist()
            
            # Return as JSON
            return jsonify({
                'questions': df.to_dict(orient='records'),
                'available_files': all_file_paths
            })
            
    except SQLAlchemyError as e:
        logger.exception("Database error in get_questions")
        return jsonify({'error': f'Database error: {str(e)}'}), 500



@app.route('/api/question/<int:question_id>', methods=['GET'])
def get_question_details(question_id):
    try:
        with engine.connect() as conn:
            # First, get the basic question data
            result = conn.execute(text("""
                SELECT eq.enhanced_text, eq.category, eq.status, eq.explanation,
                       eq.requires_image, eq.image_url, q.id AS original_question_id,
                       q.file_path AS representative_file_path,
                       STRING_AGG(ec.choice_text, '||') AS choices,
                       STRING_AGG(ec.is_correct::TEXT, '||') AS is_correct
                FROM enhanced_questions eq
                JOIN questions q ON q.id = eq.question_id
                JOIN enhanced_choices ec ON eq.id = ec.enhanced_question_id
                WHERE eq.id = :question_id
                GROUP BY eq.id, eq.enhanced_text, eq.category, eq.status, eq.explanation, 
                         eq.requires_image, eq.image_url, q.id, q.file_path
            """), {'question_id': question_id})
            
            row = result.fetchone()
            if not row:
                return jsonify({'error': 'Question not found'}), 404
                
            q_text, category, status, explanation, requires_image, image_url, original_question_id, rep_file_path, choices_text, is_correct_text = row
            
            # Now get all files where this question appears 
            # (both as a direct representative and as a duplicate)
            file_data_query = text("""
                -- Direct file location of the representative
                SELECT 
                    q.file_path, 
                    q.array_order,
                    'representative' AS question_type
                FROM questions q
                WHERE q.id = :question_id
                
                UNION ALL
                
                -- Files where this appears as a representative of duplicates
                SELECT 
                    d.file_path,
                    d.array_order,
                    'duplicate_rep' AS question_type
                FROM duplicates d
                WHERE d.representative_id = :question_id
                
                ORDER BY file_path, array_order
            """)
            
            file_data_rows = conn.execute(file_data_query, {'question_id': original_question_id}).fetchall()
            
            # Format the file data
            file_locations = []
            for file_row in file_data_rows:
                file_path, array_order, question_type = file_row
                file_locations.append({
                    'file_path': file_path,
                    'array_order': array_order,
                    'question_type': question_type
                })
            
            # Get verification results
            df_results = pd.read_sql_query(text("""
                SELECT 
                    vr.model_name,
                    vr.selected_index,
                    vr.expected_index,
                    vr.matches_expected,
                    vr.suggested_answer,
                    vr.error
                FROM verification_results vr
                WHERE vr.question_id = :question_id
                ORDER BY vr.model_name
            """), conn, params={'question_id': question_id})
        
        return jsonify({
            'id': question_id,
            'enhanced_text': q_text,
            'category': category,
            'status': status,
            'explanation': explanation,
            'requires_image': requires_image,
            'image_url': image_url,
            'original_question_id': original_question_id,
            'representative_file_path': rep_file_path,
            'file_locations': file_locations,
            'choices': choices_text.split('||') if choices_text else [],
            'is_correct': is_correct_text.split('||') if is_correct_text else [],
            'models_count': int(df_results.shape[0]),
            'verification_results': df_results.to_dict(orient='records')
        })
    except SQLAlchemyError as e:
        logger.exception("Database error in get_question_details")
        return jsonify({'error': f'Database error: {str(e)}'}), 500


@app.route('/api/question/<int:question_id>', methods=['POST'])
def update_question(question_id):
    data = request.get_json()
    new_text = data.get('enhanced_text')
    new_category = data.get('category')
    new_explanation = data.get('explanation')  # Explanation provided by the client
    choices = data.get('choices', [])
    
    if not new_text or not new_category or not choices:
        return jsonify({'status': 'error', 'error': 'Missing required fields'}), 400
    
    try:
        with engine.begin() as conn:
            # Fetch current explanation
            result = conn.execute(text("SELECT explanation FROM enhanced_questions WHERE id = :question_id"),
                                  {'question_id': question_id})
            current_explanation_row = result.fetchone()
            current_explanation = current_explanation_row[0] if current_explanation_row else None
            
            # Fetch previous correct choice
            result = conn.execute(text("""
                SELECT choice_text, is_correct 
                FROM enhanced_choices 
                WHERE enhanced_question_id = :question_id
            """), {'question_id': question_id})
            old_choices = result.fetchall()
            old_correct_index = next((i for i, choice in enumerate(old_choices) if choice[1] is True), None)
            old_correct_text = old_choices[old_correct_index][0] if old_correct_index is not None else None
            
            # Determine new correct index and compile new choices text
            new_choices_text = [choice.get('text') for choice in choices]
            correct_index = None
            for i, choice in enumerate(choices):
                if bool(choice.get('is_correct')):
                    correct_index = i
                    break
            
            new_correct_text = new_choices_text[correct_index] if correct_index is not None else None
            correct_changed = (old_correct_index != correct_index) or (old_correct_text != new_correct_text)
            
            # Decide which explanation to use
            if new_explanation and new_explanation != current_explanation:
                final_explanation = new_explanation
            elif correct_changed and correct_index is not None:
                correct_answer = new_choices_text[correct_index]
                choices_text = "\n".join([f"{i+1}. {choice}" for i, choice in enumerate(new_choices_text)])
                prompt = (
                    f"Generate a concise explanation (3-4 sentences) for why '{correct_answer}' is the correct answer without referring to index numbers. "
                    f"to the following question: {new_text}\nChoices:\n{choices_text}"
                )
                try:
                    response = client.models.generate_content(
                        model="gemini-2.0-flash",
                        contents=[prompt]
                    )
                    final_explanation = response.text.strip()
                except Exception as e:
                    logger.exception("Error generating explanation with Gemini")
                    return jsonify({'status': 'error', 'error': f'Failed to generate explanation: {str(e)}'}), 500
            else:
                final_explanation = current_explanation
            
            # Update the question record
            conn.execute(text("""
                UPDATE enhanced_questions 
                SET enhanced_text = :new_text, category = :new_category, explanation = :final_explanation, requires_image = :requires_image
                WHERE id = :question_id
            """), {
                'new_text': new_text,
                'new_category': new_category,
                'final_explanation': final_explanation,
                'requires_image': data.get('requires_image', False),
                'question_id': question_id
            })
            
            # Delete old choices
            conn.execute(text("DELETE FROM enhanced_choices WHERE enhanced_question_id = :question_id"),
                         {'question_id': question_id})
            
            # Reset the sequence for enhanced_choices to avoid duplicate keys
            conn.execute(text("""
                SELECT setval(
                    pg_get_serial_sequence('enhanced_choices', 'id'),
                    (SELECT COALESCE(MAX(id), 0) FROM enhanced_choices) + 1,
                    false
                )
            """))
            
            # Insert new choices (casting is_correct to boolean)
            for choice in choices:
                conn.execute(text("""
                    INSERT INTO enhanced_choices (enhanced_question_id, choice_text, is_correct)
                    VALUES (:question_id, :choice_text, :is_correct)
                """), {
                    'question_id': question_id,
                    'choice_text': choice.get('text'),
                    'is_correct': bool(choice.get('is_correct'))
                })
            
            # Update verification results if the correct index has changed
            if correct_index is not None:
                conn.execute(text("""
                    UPDATE verification_results
                    SET expected_index = :correct_index,
                        matches_expected = CASE WHEN selected_index = :correct_index THEN TRUE ELSE FALSE END
                    WHERE question_id = :question_id
                """), {'correct_index': correct_index, 'question_id': question_id})
                
                result = conn.execute(text("""
                    SELECT COUNT(DISTINCT model_name) AS model_count,
                           SUM(CASE WHEN matches_expected IS TRUE THEN 1 ELSE 0 END) AS agreement_count
                    FROM verification_results
                    WHERE question_id = :question_id
                """), {'question_id': question_id})
                row = result.fetchone()
                if row:
                    model_count, agreement_count = row
                    if model_count and agreement_count == model_count:
                        new_status = "verified"
                    elif model_count and agreement_count > model_count / 2:
                        new_status = "likely_correct"
                    elif agreement_count == 0:
                        new_status = "incorrect"
                    else:
                        new_status = "needs_review"
                    conn.execute(text("UPDATE enhanced_questions SET status = :new_status WHERE id = :question_id"),
                                 {'new_status': new_status, 'question_id': question_id})
        return jsonify({'status': 'success', 'explanation': final_explanation})
    except SQLAlchemyError as e:
        logger.exception("Database error in update_question")
        return jsonify({'status': 'error', 'error': f'Database error: {str(e)}'}), 500


@app.route('/api/generate_explanation', methods=['POST'])
def generate_explanation():
    data = request.get_json()
    question_text = data.get('question_text')
    choices = data.get('choices', [])
    correct_index = data.get('correct_index')
    
    if not question_text or not choices or correct_index is None or correct_index < 0 or correct_index >= len(choices):
        return jsonify({'status': 'error', 'error': 'Invalid input'}), 400
    
    correct_answer = choices[correct_index]
    choices_text = "\n".join([f"{i+1}. {choice}" for i, choice in enumerate(choices)])
    prompt = (
        f"Generate a concise explanation for why '{correct_answer}' is the correct answer without referring to index numbers or using any formatting like bold/italic... and within 300 tokens "
        f"to the following question: {question_text}\nChoices:\n{choices_text}"
    )
    
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[prompt]
            
        )
        explanation = response.text.strip()
        return jsonify({'status': 'success', 'explanation': explanation})
    except Exception as e:
        logger.exception("Error generating explanation in generate_explanation endpoint")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/question/<int:question_id>/mark-corrected', methods=['POST'])
def mark_question_corrected(question_id):
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE enhanced_questions
                SET status = 'corrected'
                WHERE id = :question_id
            """), {'question_id': question_id})
        return jsonify({'status': 'success'})
    except SQLAlchemyError as e:
        logger.exception("Database error in mark_question_corrected")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/question/<int:question_id>/image', methods=['POST', 'DELETE'])
def handle_image(question_id):
    import boto3
    from werkzeug.utils import secure_filename
    import uuid

    s3 = boto3.client(
        's3',
        aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
        region_name=os.environ.get('AWS_REGION')
    )
    bucket_name = os.environ.get('S3_BUCKET')
    cloudfront_domain = os.environ.get('CLOUDFRONT_DOMAIN')

    if request.method == 'POST':
        if 'image' not in request.files:
            return jsonify({'status': 'error', 'error': 'No image file provided'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'status': 'error', 'error': 'No selected file'}), 400

        if file:
            try:
                filename = secure_filename(file.filename)
                unique_filename = f"{uuid.uuid4()}_{filename}"

                # Upload to S3
                s3.upload_fileobj(
                    file,
                    bucket_name,
                    unique_filename,
                    ExtraArgs={
                        'ContentType': file.content_type,
                        'CacheControl': 'max-age=31536000'  # Cache for 1 year
                    }
                )

                # Generate CloudFront URL
                image_url = f"https://{cloudfront_domain}/{unique_filename}"

                # Update database
                with engine.begin() as conn:
                    # Get current image URL to delete old image if exists
                    result = conn.execute(text("""
                        SELECT image_url FROM enhanced_questions WHERE id = :question_id
                    """), {'question_id': question_id})
                    old_image = result.scalar()

                    # Update with new image URL
                    conn.execute(text("""
                        UPDATE enhanced_questions
                        SET image_url = :image_url
                        WHERE id = :question_id
                    """), {
                        'question_id': question_id,
                        'image_url': image_url
                    })

                    # Delete old image if exists
                    if old_image:
                        try:
                            old_key = old_image.split('/')[-1]
                            s3.delete_object(Bucket=bucket_name, Key=old_key)
                        except Exception as e:
                            logger.warning(f"Failed to delete old image: {str(e)}")

                return jsonify({
                    'status': 'success',
                    'image_url': image_url
                })

            except Exception as e:
                logger.exception("Error handling image upload")
                return jsonify({'status': 'error', 'error': str(e)}), 500

    elif request.method == 'DELETE':
        try:
            with engine.begin() as conn:
                # Get current image URL
                result = conn.execute(text("""
                    SELECT image_url FROM enhanced_questions WHERE id = :question_id
                """), {'question_id': question_id})
                current_image = result.scalar()

                if current_image:
                    # Delete from S3
                    image_key = current_image.split('/')[-1]
                    s3.delete_object(Bucket=bucket_name, Key=image_key)

                    # Clear image URL in database
                    conn.execute(text("""
                        UPDATE enhanced_questions
                        SET image_url = NULL
                        WHERE id = :question_id
                    """), {'question_id': question_id})

                return jsonify({'status': 'success'})

        except Exception as e:
            logger.exception("Error handling image deletion")
            return jsonify({'status': 'error', 'error': str(e)}), 500

# Add this new endpoint after the /api/questions endpoint

@app.route('/api/files', methods=['GET'])
def get_all_files():
    """Return all distinct file paths from questions and duplicates tables"""
    try:
        with engine.connect() as conn:
            query = text("""
                -- Get all files with direct representatives
                SELECT DISTINCT file_path FROM questions
                
                UNION
                
                -- Get all files with duplicates
                SELECT DISTINCT file_path FROM duplicates
                
                ORDER BY file_path
            """)
            
            df = pd.read_sql_query(query, conn)
            return jsonify({'file_paths': df['file_path'].tolist()})
    except SQLAlchemyError as e:
        logger.exception("Database error in get_all_files")
        return jsonify({'error': f'Database error: {str(e)}'}), 500

if __name__ == '__main__':
    # For production, use a WSGI server such as gunicorn.
    app.run(debug=True)


