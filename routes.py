from flask import jsonify, request, render_template
from services.question_service import (
    get_questions, get_question_details, update_question,
    mark_question_corrected, mark_question_incorrect, mark_question_needs_review
)
from services.image_service import handle_image, get_image_files, get_file_images, get_page_images, get_available_pages
from services.gemini_service import generate_explanation
from services.utils import get_all_files

def init_routes(app, engine):
    @app.route('/')
    def index():
        return render_template('dashboard.html')

    @app.route('/api/questions', methods=['GET'])
    def questions():
        file_path_filter = request.args.get('file_path')
        result = get_questions(engine, file_path_filter)
        if 'error' in result:
            return jsonify(result), 500
        return jsonify(result)

    @app.route('/api/question/<int:question_id>', methods=['GET'])
    def question_details(question_id):
        file_path_filter = request.args.get('file_path')  # Pass current file context
        result = get_question_details(engine, question_id, file_path_filter)
        if 'error' in result:
            return jsonify(result), 404 if result['error'] == 'Question not found' else 500
        return jsonify(result)

    @app.route('/api/question/<int:question_id>', methods=['POST'])
    def update_question_route(question_id):
        data = request.get_json()
        result = update_question(engine, question_id, data)
        if 'error' in result:
            return jsonify({'status': 'error', 'error': result['error']}), 400 if 'missing' in result['error'].lower() else 500
        return jsonify({'status': 'success', 'explanation': result['explanation']})

    @app.route('/api/generate_explanation', methods=['POST'])
    def generate_explanation_route():
        data = request.get_json()
        result = generate_explanation(data)
        if 'error' in result:
            return jsonify({'status': 'error', 'error': result['error']}), 400
        return jsonify({'status': 'success', 'explanation': result['explanation']})

    @app.route('/api/question/<int:question_id>/mark-<status>', methods=['POST'])
    def update_question_status_route(question_id, status):
        if status not in ['corrected', 'incorrect', 'needs_review']:
            return jsonify({'status': 'error', 'error': 'Invalid status'}), 400
            
        # Map URL status to function name
        status_functions = {
            'corrected': mark_question_corrected,
            'incorrect': mark_question_incorrect,
            'needs_review': mark_question_needs_review
        }
        
        result = status_functions[status](engine, question_id)
        if 'error' in result:
            return jsonify({'status': 'error', 'error': result['error']}), 500
        return jsonify({'status': 'success'})

    @app.route('/api/question/<int:question_id>/mark-incorrect', methods=['POST'])
    def mark_question_incorrect_route(question_id):
        result = mark_question_incorrect(engine, question_id)
        if 'error' in result:
            return jsonify({'status': 'error', 'error': result['error']}), 500
        return jsonify({'status': 'success'})

    @app.route('/api/question/<int:question_id>/mark-needs-review', methods=['POST'])
    def mark_question_needs_review_route(question_id):
        result = mark_question_needs_review(engine, question_id)
        if 'error' in result:
            return jsonify({'status': 'error', 'error': result['error']}), 500
        return jsonify({'status': 'success'})

    @app.route('/api/question/<int:question_id>/image', methods=['POST', 'DELETE'])
    def image_handler(question_id):
        result = handle_image(engine, question_id, request)
        if 'error' in result:
            return jsonify({'status': 'error', 'error': result['error']}), 400 if 'no image' in result['error'].lower() or 'no file' in result['error'].lower() else 500
        return jsonify({'status': 'success', 'image_url': result.get('image_url') if 'image_url' in result else None})

    @app.route('/api/image_files', methods=['GET'])
    def image_files():
        result = get_image_files(engine)
        if 'error' in result:
            return jsonify({'error': result['error']}), 500
        return jsonify({'files': result['files']})

    @app.route('/api/file_images', methods=['GET'])
    def file_images():
        result = get_file_images(engine, request.args)
        if 'error' in result:
            return jsonify(result), 400 if 'missing' in result['error'].lower() else 500
        return jsonify(result)

    @app.route('/api/page_images', methods=['GET'])
    def page_images():
        result = get_page_images(engine, request.args)
        if 'error' in result and 'no matching images' not in result['error'].lower():
            return jsonify(result), 400 if 'missing' in result['error'].lower() else 500
        return jsonify(result)

    @app.route('/api/available_pages', methods=['GET'])
    def available_pages():
        file_path = request.args.get('file_path')
        if not file_path:
            return jsonify({'error': 'Missing file_path parameter'}), 400
        result = get_available_pages(engine, file_path)
        if 'error' in result:
            return jsonify(result), 500
        return jsonify(result)

    @app.route('/api/files', methods=['GET'])
    def all_files():
        result = get_all_files(engine)
        if 'error' in result:
            return jsonify({'error': result['error']}), 500
        return jsonify({'file_paths': result})