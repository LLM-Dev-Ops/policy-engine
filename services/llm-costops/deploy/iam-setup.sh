#!/bin/bash
# LLM-CostOps IAM Setup Script
# Creates service account with least privilege permissions

set -e

PROJECT_ID="${PROJECT_ID:-agentics-dev}"
SERVICE_ACCOUNT_NAME="llm-costops-sa"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Setting up IAM for LLM-CostOps in project: ${PROJECT_ID}"

# Create service account
echo "Creating service account: ${SERVICE_ACCOUNT_NAME}"
gcloud iam service-accounts create ${SERVICE_ACCOUNT_NAME} \
  --project=${PROJECT_ID} \
  --display-name="LLM-CostOps Service Account" \
  --description="Service account for LLM-CostOps with least privilege" \
  2>/dev/null || echo "Service account already exists"

# Grant Cloud Run invoker role (for internal service calls)
echo "Granting Cloud Run invoker role..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/run.invoker" \
  --condition=None

# Grant Secret Manager accessor role (for secrets)
echo "Granting Secret Manager accessor role..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None

# Grant Cloud Trace agent role (for telemetry)
echo "Granting Cloud Trace agent role..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/cloudtrace.agent" \
  --condition=None

# Grant Cloud Logging writer role (for logs)
echo "Granting Cloud Logging writer role..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/logging.logWriter" \
  --condition=None

# Grant Cloud Monitoring metric writer role (for metrics)
echo "Granting Cloud Monitoring metric writer role..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/monitoring.metricWriter" \
  --condition=None

echo ""
echo "IAM setup complete!"
echo "Service Account: ${SERVICE_ACCOUNT_EMAIL}"
echo ""
echo "Required secrets to create in Secret Manager:"
echo "  - ruvector-service-url"
echo "  - ruvector-api-key"
echo "  - telemetry-endpoint"
