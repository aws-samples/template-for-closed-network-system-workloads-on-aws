FROM python:3.11.1-alpine

WORKDIR /usr/src/app
VOLUME /usr/src/app

COPY requirements.txt ./

RUN apk update && apk add --upgrade sqlite-libs && apk add --upgrade libcrypto3 && apk add --upgrade libssl3 && apk add curl && apk add -f python3 py3-pip && pip install --no-cache-dir -r requirements.txt

RUN curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /usr/src/app/root.pem

RUN addgroup -S python && adduser -S python -G python
USER python

COPY . .

CMD [ "python", "./src/sample/batch.py" ]