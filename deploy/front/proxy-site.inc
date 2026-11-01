proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host $http_host;
# Écrase l'en-tête reçu : l'adresse retenue est celle déterminée par real_ip (de confiance) ou celle de la connexion.
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $proto;
proxy_set_header X-Real-IP $remote_addr;
