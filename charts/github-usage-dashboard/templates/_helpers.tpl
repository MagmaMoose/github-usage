{{/* Common helpers for the github-usage-dashboard chart. */}}

{{- define "gud.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "gud.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "gud.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "gud.labels" -}}
helm.sh/chart: {{ include "gud.chart" . }}
{{ include "gud.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "gud.selectorLabels" -}}
app.kubernetes.io/name: {{ include "gud.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "gud.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
  {{- default (include "gud.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
  {{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "gud.image" -}}
{{- $tag := default .Chart.AppVersion .Values.image.tag -}}
{{ .Values.image.repository }}:{{ $tag }}
{{- end -}}

{{/* Name of the Secret holding the app's secret env vars, or "" when none. */}}
{{- define "gud.secretName" -}}
{{- if .Values.secrets.existingSecretName -}}
{{- .Values.secrets.existingSecretName -}}
{{- else if or .Values.secrets.create .Values.externalSecret.enabled .Values.database.url -}}
{{- printf "%s-env" (include "gud.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/* Emits "true" when the chart renders its own (non-external) -env Secret,
     else "". (Go template and/or return the operand, not a bool, so we must
     collapse to a literal string for `eq ... "true"` checks.) */}}
{{- define "gud.managedSecret" -}}
{{- if and (not .Values.externalSecret.enabled) (or .Values.secrets.create .Values.database.url) -}}
true
{{- end -}}
{{- end -}}
