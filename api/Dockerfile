FROM python:3.11-alpine

# Install python and pip
WORKDIR /app

RUN apk add --no-cache python3 py3-pip

COPY requirements.txt .
RUN pip3 install --break-system-packages -r requirements.txt
COPY . /app

EXPOSE 8000

CMD ["uvicorn", "main:app"]
