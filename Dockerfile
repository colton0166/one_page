# 用 nginx 提供靜態網頁，映像檔很小（約 50MB）
FROM nginx:alpine

# 把資料夾內容整包放進網站根目錄
# （.dockerignore 裡列的檔案不會被複製進來）
COPY . /usr/share/nginx/html/

# 把 nginx 設定搬到正確位置，不要留在網站根目錄被人看到
RUN mv /usr/share/nginx/html/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
