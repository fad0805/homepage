FROM python:3.11-alpine

# Install python and pip
WORKDIR /app

COPY requirements.txt .
RUN pip3 install --break-system-packages -r requirements.txt
COPY . .

EXPOSE 8000

CMD ["sh", "-c", "./entrypoint.sh"]
