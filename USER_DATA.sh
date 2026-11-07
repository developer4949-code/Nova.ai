#!/bin/bash
set -euo pipefail

# 1. Create a 2GB swap file so Next.js build never runs out of RAM on t2.micro/t3.micro (1GB RAM)
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. System updates and install Node.js 22, Git, and Nginx
yum update -y
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
yum install -y nodejs git nginx
npm install -g pm2

# 3. Configure Nginx reverse proxy (Port 80 -> Port 3000)
cat > /etc/nginx/conf.d/nova.conf <<'NGINX'
server {
    listen 80;
    server_name _;
    client_max_body_size 15M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

systemctl enable nginx
systemctl restart nginx

# 4. Clone repository into ec2-user directory
cd /home/ec2-user
rm -rf Nova.ai
git clone https://github.com/developer4949-code/Nova.ai.git
cd Nova.ai

# 5. Environment configuration (Matching Sydney ap-southeast-2 stack)
cat > .env.local <<'ENV'
AWS_REGION=ap-southeast-2
S3_BUCKET_NAME=nova-contracts-debi-2026
DYNAMODB_TABLE_NAME=ScopeLogs
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL_ID=gemini-3.5-flash-lite
PORT=3000
ENV

chown -R ec2-user:ec2-user /home/ec2-user/Nova.ai

# 6. Install dependencies and build Next.js as ec2-user
sudo -u ec2-user bash -c "cd /home/ec2-user/Nova.ai && npm install && npm run build"

# 7. Start app with PM2 and configure auto-start on reboot
sudo -u ec2-user bash -c "cd /home/ec2-user/Nova.ai && pm2 start npm --name nova -- start"
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user
sudo -u ec2-user pm2 save
