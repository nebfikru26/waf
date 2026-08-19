FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY dataset_builder.py train.py ./

# Training is run as a one-shot job; no CMD needed for long-running
# Use: docker compose run ml-trainer
ENTRYPOINT ["sh", "-c", "python dataset_builder.py && python train.py"]
