# Consensus Dashboard

A specialized web application for managing and correcting quiz questions in a database. The application provides an intuitive interface for editing questions, managing choices, and maintaining question quality with AI-powered explanations.

## Features

- 🎯 Interactive dashboard for managing quiz questions
- 🔍 Advanced search and filtering by file path, status, and category
- ✏️ Edit questions, add/remove choices, and select correct answers
- 🤖 Auto-generated explanations using Google Gemini AI
- 🖼️ Image management capabilities with AWS S3/CloudFront
- 📊 Question status tracking (verified, likely correct, needs review)
- 🗄️ PostgreSQL database integration via Supabase

## Prerequisites

- Python 3.8+
- PostgreSQL database (via Supabase)
- Google Gemini API key
- AWS account for S3/CloudFront
- Node.js and npm (for frontend development)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
SUPABASE_USER=your_user
SUPABASE_PASSWORD=your_password
SUPABASE_HOST=your_host
SUPABASE_PORT=your_port
SUPABASE_DBNAME=your_dbname
GEMINI_API_KEY=your_gemini_api_key
AWS_ACCESS_KEY_ID=your_aws_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=your_aws_region
S3_BUCKET=your_bucket_name
CLOUDFRONT_DOMAIN=your_cloudfront_domain
```

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/consensus-dashboard.git
cd consensus-dashboard
```

2. Create and activate a virtual environment:

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Run migrations (if applicable)

5. Start the development server:

```bash
python app.py
```

Or with Gunicorn:

```bash
gunicorn app:app
```

## Project Structure

```
consensus-dashboard/
├── app.py              # Application entry point
├── config.py           # Configuration settings
├── models.py           # Database models
├── routes.py           # API routes
├── services/          # Service modules
│   ├── gemini_service.py
│   ├── image_service.py
│   └── question_service.py
├── static/            # Static files (JS, CSS)
├── templates/         # HTML templates
└── tests/            # Test cases
```

## Deployment

The application can be deployed using Gunicorn as the WSGI server. Example deployment command:

```bash
gunicorn app:app --workers 4 --bind 0.0.0.0:8000
```

## Testing

Run the test suite:

```bash
python -m pytest tests/
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Flask](https://flask.palletsprojects.com/)
- [Google Gemini API](https://ai.google.dev/)
- [Supabase](https://supabase.com/)
- [AWS S3/CloudFront](https://aws.amazon.com/)
