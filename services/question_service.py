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
                        q.file_path AS representative_file_path,
                        COALESCE(q_direct.page, d.page) as page,
                        COALESCE(q_direct.original_question_number, d.original_question_number) as original_question_number,
                        COUNT(DISTINCT vr.model_name) AS models_count,
                        SUM(CASE WHEN vr.matches_expected IS TRUE THEN 1 ELSE 0 END) AS matching_models,
                        q.question_text AS original_question_text,
                        (SELECT STRING_AGG(d2.question_text, '||')
                         FROM duplicates d2
                         WHERE d2.representative_id = eq.question_id
                         AND d2.file_path = :file_path) AS duplicate_question_texts
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
                        q_direct.array_order, d.array_order,
                        q_direct.page, d.page, q_direct.original_question_number, d.original_question_number,
                        q.question_text
                    ORDER BY COALESCE(q_direct.array_order, d.array_order)
                """)
                df = pd.read_sql_query(query, conn, params={'file_path': file_path_filter})
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
                        SUM(CASE WHEN vr.matches_expected IS TRUE THEN 1 ELSE 0 END) AS matching_models,
                        q.question_text AS original_question_text,
                        (SELECT STRING_AGG(d.question_text, '||')
                         FROM duplicates d
                         WHERE d.representative_id = eq.question_id) AS duplicate_question_texts
                    FROM enhanced_questions eq
                    JOIN questions q ON q.id = eq.question_id
                    LEFT JOIN verification_results vr ON eq.id = vr.question_id
                    GROUP BY eq.id, eq.question_id, eq.enhanced_text, eq.category, eq.status, 
                             eq.requires_image, eq.image_url, q.file_path, q.page, q.original_question_number,
                             q.question_text
                    ORDER BY eq.id
                """)
                df = pd.read_sql_query(query, conn)
            
            logger.info(f"Retrieved {len(df)} questions{' for file ' + file_path_filter if file_path_filter else ''}")

            all_files_query = text("""
                SELECT DISTINCT file_path
                FROM (
                    SELECT q.file_path 
                    FROM questions q
                    JOIN enhanced_questions eq ON q.id = eq.question_id
                    UNION
                    SELECT d.file_path
                    FROM duplicates d
                    JOIN enhanced_questions eq ON d.representative_id = eq.question_id
                ) AS files
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
        return {'error': 'An unexpected database error occurred'}


def get_question_details(engine, question_id, file_path_filter=None):
    try:
        with engine.connect() as conn:
            query = text("""
                SELECT eq.enhanced_text, eq.category, eq.status, eq.explanation,
                       eq.requires_image, eq.image_url,
                       STRING_AGG(ec.choice_text, '||') AS choices,
                       STRING_AGG(ec.is_correct::BOOLEAN::TEXT, '||') AS is_correct,
                       q.question_text AS original_question_text
                FROM enhanced_questions eq
                JOIN questions q ON q.id = eq.question_id
                LEFT JOIN enhanced_choices ec ON eq.id = ec.enhanced_question_id
                WHERE eq.id = :question_id
                GROUP BY eq.id, eq.enhanced_text, eq.category, eq.status, eq.explanation,
                         eq.requires_image, eq.image_url, q.question_text
            """)
            result = conn.execute(query, {'question_id': question_id})
            row = result.fetchone()
            if not row:
                logger.warning(f"Question {question_id} not found")
                return {'error': 'Question not found'}

            q_text, category, status, explanation, requires_image, image_url, \
            choices_text, is_correct_text, original_question_text = row

            # Determine file information based on file_path_filter
            file_query = text("""
                SELECT 
                    COALESCE(d.file_path, q.file_path) AS file_path,
                    COALESCE(d.page, q.page) AS page,
                    COALESCE(d.original_question_number, q.original_question_number) AS question_number
                FROM questions q
                LEFT JOIN duplicates d ON d.representative_id = q.id
                    AND (:file_path = '' OR d.file_path = :file_path)
                WHERE q.id = (
                    SELECT question_id FROM enhanced_questions WHERE id = :question_id
                )
            """)
            file_result = conn.execute(file_query, {
                'question_id': question_id,
                'file_path': file_path_filter or ''
            }).fetchone()
            if not file_result:
                logger.warning(f"No file information found for question {question_id}")
                return {'error': 'No file information found'}
            file_path, page, question_number = file_result

            file_data_query = text("""
                SELECT 
                    q.file_path, 
                    q.array_order,
                    q.page,
                    q.original_question_number,
                    'representative' AS question_type
                FROM questions q
                WHERE q.id = (
                    SELECT question_id FROM enhanced_questions WHERE id = :question_id
                )
                UNION ALL
                SELECT 
                    d.file_path,
                    d.array_order,
                    d.page,
                    d.original_question_number,
                    'duplicate_rep' AS question_type
                FROM duplicates d
                WHERE d.representative_id = (
                    SELECT question_id FROM enhanced_questions WHERE id = :question_id
                )
                ORDER BY file_path, array_order
            """)
            file_data_rows = conn.execute(file_data_query, {'question_id': question_id}).fetchall()
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

            verification_results_query = text("""
                SELECT 
                    vr.model_name,
                    vr.selected_index,
                    vr.expected_index,
                    vr.matches_expected,
                    COALESCE(vr.suggested_answer, '') AS suggested_answer,
                    COALESCE(vr.error, '') AS error
                FROM verification_results vr
                WHERE vr.question_id = :question_id
                ORDER BY vr.model_name
            """)
            verification_results = conn.execute(verification_results_query, {'question_id': question_id}).fetchall()
            models_count = len(verification_results)
            verification_results_dict = [
                {
                    'model_name': model_name,
                    'selected_index': selected_index,
                    'expected_index': expected_index,
                    'matches_expected': matches_expected,
                    'suggested_answer': suggested_answer,
                    'error': error
                }
                for model_name, selected_index, expected_index, matches_expected, suggested_answer, error in verification_results
            ]

            return {
                'id': question_id,
                'enhanced_text': q_text,
                'original_question_text': original_question_text,
                'category': category,
                'status': status,
                'explanation': explanation,
                'requires_image': requires_image,
                'image_url': image_url,
                'file_path': file_path,
                'page': page,
                'question_number': question_number,
                'file_locations': file_locations,
                'choices': choices_text.split('||') if choices_text else [],
                'is_correct': is_correct_text.split('||') if is_correct_text else [],
                'models_count': models_count,
                'verification_results': verification_results_dict
            }
    except SQLAlchemyError as e:
        logger.exception("Database error in get_question_details")
        return {'error': 'An unexpected database error occurred'}

def update_question(engine, question_id, data):
    new_text = data.get('enhanced_text')
    new_category = data.get('category')
    new_explanation = data.get('explanation')
    choices = data.get('choices', [])
    
    if not new_text or not new_category or not choices:
        return {'error': 'Missing required fields'}
    if not all(choice.get('text') for choice in choices):
        return {'error': 'All choices must have non-empty text'}
    
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
                ORDER BY id
            """), {'question_id': question_id})
            old_choices = result.fetchall()
            old_correct_index = next((i for i, choice in enumerate(old_choices) if choice[1]), None)
            old_correct_text = old_choices[old_correct_index][0] if old_correct_index is not None else None
            
            new_choices_text = [choice.get('text') for choice in choices]
            correct_index = next((i for i, choice in enumerate(choices) if bool(choice.get('is_correct'))), None)
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
                    return {'error': 'Failed to generate explanation'}
            else:
                final_explanation = current_explanation
            
            conn.execute(text("""
                UPDATE enhanced_questions 
                SET enhanced_text = :new_text, 
                    category = :new_category, 
                    explanation = :final_explanation, 
                    requires_image = :requires_image
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
            
            for choice in choices:
                conn.execute(text("""
                    INSERT INTO enhanced_choices (enhanced_question_id, choice_text, is_correct)
                    VALUES (:question_id, :choice_text, :is_correct)
                """), {
                    'question_id': question_id,
                    'choice_text': choice.get('text'),
                    'is_correct': bool(choice.get('is_correct'))
                })
            
            if correct_changed and correct_index is not None:
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
        return {'error': 'An unexpected database error occurred'}


def update_question_status(engine, question_id, status):
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE enhanced_questions
                SET status = :status
                WHERE id = :question_id
            """), {'question_id': question_id, 'status': status})
        return {}
    except SQLAlchemyError as e:
        logger.exception(f"Database error in update_question_status to {status}")
        return {'error': f'Database error: {str(e)}'}

def mark_question_corrected(engine, question_id):
    return update_question_status(engine, question_id, 'corrected')

def mark_question_incorrect(engine, question_id):
    return update_question_status(engine, question_id, 'incorrect')

def mark_question_needs_review(engine, question_id):
    return update_question_status(engine, question_id, 'needs_review')