import logging
from google import genai
from config import Config

logger = logging.getLogger(__name__)
client = genai.Client(api_key=Config.GEMINI_API_KEY)

def generate_explanation(data):
    question_text = data.get('question_text')
    choices = data.get('choices', [])
    correct_index = data.get('correct_index')
    if not question_text or not choices or correct_index is None or correct_index < 0 or correct_index >= len(choices):
        return {'error': 'Invalid input'}
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
        return {'explanation': explanation}
    except Exception as e:
        logger.exception("Error generating explanation")
        return {'error': str(e)}