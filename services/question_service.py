import logging
import pandas as pd
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from services.gemini_service import client

logger = logging.getLogger(__name__)

def get_questions(engine, file_path_filter=None):
    try:
        with engine.connect() as conn:
            if file_path_filter:
                query = text("""
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
                        COALESCE(q_direct.page, d.page) as page,
                        COALESCE(q_direct.original_question_number, d.original_question_number) as original_question_number,
                        COUNT(DISTINCT vr.model_name) AS models_count,
                        SUM(CASE WHEN vr.matches_expected IS TRUE THEN 1 ELSE 0 END) AS matching_models
                    FROM enhanced_questions eq
                    JOIN questions q ON q.id = eq.question_id
                    LEFT JOIN verification_results vr ON eq.id = vr.question_id
                    LEFT JOIN questions q_direct ON 
                        q_direct.id = eq.question_id AND 
                        q_direct.file_path = :file_path
                    LEFT JOIN duplicates d ON 
                        d.representative_id = eq.question_id AND 
                        d.file_path = :file_path
                    WHERE 
                        q_direct.id IS NOT NULL OR d.representative_id IS NOT NULL
                    GROUP BY 
                        eq.id, eq.question_id, eq.enhanced_text, eq.category, eq.status, 
                        eq.requires_image, eq.image_url, q.file_path, 
                        q_direct.array_order, d.array_order, q_direct.id,
                        q_direct.page, d.page, q_direct.original_question_number, d.original_question_number
                    ORDER BY 
                        COALESCE(q_direct.array_order, d.array_order)
                """)
                df = pd.read_sql_query(query, conn, params={'file_path': file_path_filter})
                logger.info(f"Optimized query returned {len(df)} enhanced questions for file {file_path_filter}")
            else:
                query = text("""
                    SELECT 
                        eq.id,
                        eq.question_id,
                        eq.enhanced_text,
                        eq.category,
                        eq.status,
                        eq.requires_image,
                        eq.image_url,
                        q.file_path AS representative_file_path,
                        q.page AS page,
                        q.original_question_number AS original_question_number,
                        COUNT(DISTINCT vr.model_name) AS models_count,
                        SUM(CASE WHEN vr.matches_expected IS TRUE THEN 1 ELSE 0 END) AS matching_models
                    FROM enhanced_questions eq
                    JOIN questions q ON q.id = eq.question_id
                    LEFT JOIN verification_results vr ON eq.id = vr.question_id
                    GROUP BY eq.id, eq.question_id, eq.enhanced_text, eq.category, eq.status, 
                             eq.requires_image, eq.image_url, q.file_path, q.page, q.original_question_number
                    ORDER BY eq.id
                """)
                df = pd.read_sql_query(query, conn)

            all_files_query = text("""
                SELECT DISTINCT q.file_path 
                FROM questions q
                JOIN enhanced_questions eq ON q.id = eq.question_id
                UNION
                SELECT DISTINCT d.file_path
                FROM duplicates d
                JOIN enhanced_questions eq ON d.representative_id = eq.question_id
                ORDER BY file_path
            """)
            all_files_df = pd.read_sql_query(all_files_query, conn)
            all_file_paths = all_files_df['file_path'].tolist()

            return {
                'questions': df.to_dict(orient='records'),
                'available_files': all_file_paths
            }
    except SQLAlchemyError as e:
        logger.exception("Database error in get_questions")
        return {'error': f'Database error: {str(e)}'}


def get_question_details(engine, question_id, file_path_filter=None):
    try:
        with engine.connect() as conn:
            existence_check = conn.execute(text("""
                SELECT EXISTS(SELECT 1 FROM enhanced_questions WHERE id = :question_id) as exists
            """), {'question_id': question_id}).fetchone()
            if not existence_check or not existence_check[0]:
                logger.warning(f"Question {question_id} not found in enhanced_questions table")
                return {'error': 'Question not found'}

            # First, fetch the enhanced question data
            query = text("""
                SELECT eq.enhanced_text, eq.category, eq.status, eq.explanation,
                       eq.requires_image, eq.image_url, q.id AS original_question_id,
                       STRING_AGG(ec.choice_text, '||') AS choices,
                       STRING_AGG(ec.is_correct::TEXT, '||') AS is_correct
                FROM enhanced_questions eq
                JOIN questions q ON q.id = eq.question_id
                LEFT JOIN enhanced_choices ec ON eq.id = ec.enhanced_question_id
                WHERE eq.id = :question_id
                GROUP BY eq.id, eq.enhanced_text, eq.category, eq.status, eq.explanation, 
                         eq.requires_image, eq.image_url, q.id
            """)
            result = conn.execute(query, {'question_id': question_id})
            row = result.fetchone()
            if not row:
                logger.warning(f"Question {question_id} found but base query returned no results")
                return {'error': 'Question not found'}

            q_text, category, status, explanation, requires_image, image_url, original_question_id, \
            choices_text, is_correct_text = row

            # Determine representative_file_path and representative_page
            if file_path_filter:
                # Check duplicates first
                dup_query = text("""
                    SELECT d.file_path, d.page, d.original_question_number
                    FROM duplicates d
                    WHERE d.representative_id = :original_question_id AND d.file_path = :file_path
                """)
                dup_result = conn.execute(dup_query, {'original_question_id': original_question_id, 'file_path': file_path_filter}).fetchone()
                if dup_result:
                    representative_file_path, representative_page, representative_question_number = dup_result
                    logger.info(f"Using duplicate file_path {representative_file_path}, page {representative_page} for question {question_id}")
                else:
                    # Fallback to questions table if no duplicate matches
                    q_query = text("""
                        SELECT q.file_path, q.page, q.original_question_number
                        FROM questions q
                        WHERE q.id = :original_question_id
                    """)
                    q_result = conn.execute(q_query, {'original_question_id': original_question_id}).fetchone()
                    if q_result:
                        representative_file_path, representative_page, representative_question_number = q_result
                        logger.info(f"Using representative file_path {representative_file_path}, page {representative_page} for question {question_id}")
                    else:
                        logger.warning(f"No file_path found for question {question_id}")
                        return {'error': 'No file information found'}
            else:
                # Default to questions table
                q_query = text("""
                    SELECT q.file_path, q.page, q.original_question_number
                    FROM questions q
                    WHERE q.id = :original_question_id
                """)
                q_result = conn.execute(q_query, {'original_question_id': original_question_id}).fetchone()
                if not q_result:
                    logger.warning(f"No representative found for question {question_id}")
                    return {'error': 'No representative found'}
                representative_file_path, representative_page, representative_question_number = q_result

            # Fetch all file locations
            file_data_query = text("""
                SELECT 
                    q.file_path, 
                    q.array_order,
                    q.page,
                    q.original_question_number,
                    'representative' AS question_type
                FROM questions q
                WHERE q.id = :question_id
                UNION ALL
                SELECT 
                    d.file_path,
                    d.array_order,
                    d.page,
                    d.original_question_number,
                    'duplicate_rep' AS question_type
                FROM duplicates d
                WHERE d.representative_id = :question_id
                ORDER BY file_path, array_order
            """)
            file_data_rows = conn.execute(file_data_query, {'question_id': original_question_id}).fetchall()
            file_locations = [
                {
                    'file_path': file_path,
                    'array_order': array_order,
                    'page': page,
                    'question_number': question_number,
                    'question_type': question_type
                }
                for file_path, array_order, page, question_number, question_type in file_data_rows
            ]

            # Verification results
            verification_results_query = text("""
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
            """)
            verification_results = conn.execute(verification_results_query, {'question_id': question_id}).fetchall()
            if verification_results:
                df_results = pd.DataFrame(verification_results, columns=[
                    'model_name', 'selected_index', 'expected_index',
                    'matches_expected', 'suggested_answer', 'error'
                ])
                models_count = len(df_results)
                verification_results_dict = df_results.to_dict(orient='records')
            else:
                models_count = 0
                verification_results_dict = []

            return {
                'id': question_id,
                'enhanced_text': q_text,
                'category': category,
                'status': status,
                'explanation': explanation,
                'requires_image': requires_image,
                'image_url': image_url,
                'original_question_id': original_question_id,
                'representative_file_path': representative_file_path,
                'representative_page': representative_page,
                'representative_question_number': representative_question_number,
                'file_locations': file_locations,
                'choices': choices_text.split('||') if choices_text else [],
                'is_correct': is_correct_text.split('||') if is_correct_text else [],
                'models_count': models_count,
                'verification_results': verification_results_dict
            }
    except SQLAlchemyError as e:
        logger.exception("Database error in get_question_details")
        return {'error': f'Database error: {str(e)}'}


def update_question(engine, question_id, data):
    new_text = data.get('enhanced_text')
    new_category = data.get('category')
    new_explanation = data.get('explanation')
    choices = data.get('choices', [])
    
    if not new_text or not new_category or not choices:
        return {'error': 'Missing required fields'}
    
    try:
        with engine.begin() as conn:
            result = conn.execute(text("SELECT explanation FROM enhanced_questions WHERE id = :question_id"),
                                  {'question_id': question_id})
            current_explanation_row = result.fetchone()
            current_explanation = current_explanation_row[0] if current_explanation_row else None
            
            result = conn.execute(text("""
                SELECT choice_text, is_correct 
                FROM enhanced_choices 
                WHERE enhanced_question_id = :question_id
            """), {'question_id': question_id})
            old_choices = result.fetchall()
            old_correct_index = next((i for i, choice in enumerate(old_choices) if choice[1] is True), None)
            old_correct_text = old_choices[old_correct_index][0] if old_correct_index is not None else None
            
            new_choices_text = [choice.get('text') for choice in choices]
            correct_index = None
            for i, choice in enumerate(choices):
                if bool(choice.get('is_correct')):
                    correct_index = i
                    break
            
            new_correct_text = new_choices_text[correct_index] if correct_index is not None else None
            correct_changed = (old_correct_index != correct_index) or (old_correct_text != new_correct_text)
            
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
                    return {'error': f'Failed to generate explanation: {str(e)}'}
            else:
                final_explanation = current_explanation
            
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
            
            conn.execute(text("DELETE FROM enhanced_choices WHERE enhanced_question_id = :question_id"),
                         {'question_id': question_id})
            
            conn.execute(text("""
                SELECT setval(
                    pg_get_serial_sequence('enhanced_choices', 'id'),
                    (SELECT COALESCE(MAX(id), 0) FROM enhanced_choices) + 1,
                    false
                )
            """))
            
            for choice in choices:
                conn.execute(text("""
                    INSERT INTO enhanced_choices (enhanced_question_id, choice_text, is_correct)
                    VALUES (:question_id, :choice_text, :is_correct)
                """), {
                    'question_id': question_id,
                    'choice_text': choice.get('text'),
                    'is_correct': bool(choice.get('is_correct'))
                })
            
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
        return {'explanation': final_explanation}
    except SQLAlchemyError as e:
        logger.exception("Database error in update_question")
        return {'error': f'Database error: {str(e)}'}

def mark_question_corrected(engine, question_id):
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE enhanced_questions
                SET status = 'corrected'
                WHERE id = :question_id
            """), {'question_id': question_id})
        return {}
    except SQLAlchemyError as e:
        logger.exception("Database error in mark_question_corrected")
        return {'error': f'Database error: {str(e)}'}