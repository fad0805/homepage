FROM python:3.11-alpine

# Install python and pip
WORKDIR /app

COPY requirements.txt .
RUN pip3 install --break-system-packages -r requirements.txt
COPY . .

RUN adduser -D -u 1000 homepage \
    && mkdir -p /app/uploads \
    && chown -R homepage:homepage /app/uploads
USER homepage

EXPOSE 8000

CMD ["sh", "-c", "./entrypoint.sh"]
