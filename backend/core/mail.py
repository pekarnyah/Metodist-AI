import os
from email.message import EmailMessage
import aiosmtplib
from dotenv import load_dotenv

load_dotenv()
ENV = os.getenv("ENV", "development").lower()
LOG_OTP = os.getenv("LOG_OTP", "").lower() in {"1", "true", "yes"}

async def send_otp_email(target_email: str, code: str):
    message = EmailMessage()
    message["From"] = f"Metodist.co.ua <{os.getenv('MAIL_FROM')}>"
    message["To"] = target_email
    message["Subject"] = f"{code} — Код підтвердження Metodist"
    
    # HTML-шаблон в стиле Steam/Modern SaaS
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ background-color: #0b0f19; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }}
            .container {{ max-width: 500px; margin: 40px auto; background-color: #1b2838; color: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid #2a475e; box-shadow: 0 8px 20px rgba(0,0,0,0.3); }}
            .header {{ background: linear-gradient(90deg, #171a21 0%, #1b2838 100%); padding: 30px; text-align: center; border-bottom: 3px solid #66c0f4; }}
            .header h1 {{ margin: 0; color: #66c0f4; font-size: 26px; letter-spacing: 2px; }}
            .content {{ padding: 40px 30px; line-height: 1.6; }}
            .content h2 {{ margin-top: 0; color: #66c0f4; }}
            .content a.btn {{ color: #ffffff; background-color: #66c0f4; padding: 8px 14px; border-radius: 4px; text-decoration: none; font-weight: bold; transition: background 0.3s; }}
            .content a.btn:hover {{ background-color: #559bd6; }}
            .code-box {{ background: #2a475e; border-radius: 6px; padding: 20px; text-align: center; margin: 25px 0; border: 2px dashed #66c0f4; }}
            .code {{ font-size: 36px; font-weight: bold; color: #66c0f4; letter-spacing: 8px; }}
            .footer {{ background-color: #171a21; padding: 20px; text-align: center; font-size: 12px; color: #8f98a0; line-height: 1.5; }}
            .support {{ margin-top: 15px; font-size: 13px; color: #a0c4ff; }}
            .support a {{ color: #66c0f4; text-decoration: none; font-weight: bold; }}
            .support a:hover {{ text-decoration: underline; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>METODIST</h1>
            </div>
            <div class="content">
                <h2>Привіт!</h2>
                <p>Ви отримали цей лист, бо ця пошта була вказана при реєстрації на <a href="https://metodist.co.ua" class="btn">metodist.co.ua</a>.</p>
                <p>Щоб завершити реєстрацію та активувати акаунт, використайте код підтвердження:</p>
                
                <div class="code-box">
                    <span class="code">{code}</span>
                </div>
                
                <p>Код дійсний <b>15 хвилин</b>. Якщо ви не створювали акаунт, просто ігноруйте цей лист.</p>
                
                <div class="support">
                    Знайшли баг чи неполадку? Звертайтесь на <a href="mailto:support@metodist.co.ua">support@metodist.co.ua</a>. Ми завжди раді вашому фідбеку!
                </div>
            </div>
            <div class="footer">
                &copy; 2026 Metodist.co.ua. Всі права захищені.<br>
                Автоматизація освітнього процесу з ШІ.
            </div>
        </div>
    </body>
    </html>
    """
    message.set_content(f"Ваш код підтвердження: {code}", subtype="plain", charset="utf-8")
    message.add_alternative(html_content, subtype="html", charset="utf-8")

    try:
        mail_port = os.getenv("MAIL_PORT")
        if not os.getenv("MAIL_SERVER") or not mail_port or not os.getenv("MAIL_USERNAME") or not os.getenv("MAIL_PASSWORD"):
            raise RuntimeError("MAIL_SERVER/MAIL_PORT/MAIL_USERNAME/MAIL_PASSWORD are not configured")

        await aiosmtplib.send(
            message,
            hostname=os.getenv("MAIL_SERVER"),
            port=int(mail_port),
            username=os.getenv("MAIL_USERNAME"),
            password=os.getenv("MAIL_PASSWORD"),
            start_tls=True
        )
        if LOG_OTP or ENV != "production":
            print(f"OTP sent to {target_email}: {code}")
        return True
    except Exception as e:
        print(f"Ошибка SMTP: {e}")
        return False
