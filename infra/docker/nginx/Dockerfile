FROM nginx

VOLUME /var/cache/nginx
VOLUME /var/run
VOLUME /etc/nginx/conf.d
VOLUME /usr/share/nginx/html

COPY default.conf /etc/nginx/conf.d/default.conf
COPY static-content /usr/share/nginx/html
