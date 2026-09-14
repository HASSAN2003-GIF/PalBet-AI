FROM php:8.4-fpm

# Added libzip-dev and zip extension which Composer requires
RUN apt-get update && apt-get install -y \
    nginx git unzip libpq-dev libzip-dev \
    python3 python3-pip python3-venv \
    && docker-php-ext-install pdo pdo_pgsql zip

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install google-generativeai requests

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www
COPY . .

WORKDIR /var/www/api
# Allow Composer to run inside the Docker build process
ENV COMPOSER_ALLOW_SUPERUSER=1
RUN composer install --optimize-autoloader --no-dev
RUN chown -R www-data:www-data /var/www/api/storage /var/www/api/bootstrap/cache

COPY deploy/nginx.conf /etc/nginx/sites-available/default

EXPOSE 80
CMD ["sh", "-c", "sed -i \"s/\\${PORT}/$PORT/g\" /etc/nginx/sites-available/default && service nginx start && php-fpm"]