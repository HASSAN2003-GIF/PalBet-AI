FROM php:8.2-fpm

RUN apt-get update && apt-get install -y \
    nginx git unzip libpq-dev \
    python3 python3-pip python3-venv \
    && docker-php-ext-install pdo pdo_pgsql

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install google-generativeai requests

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www
COPY . .

WORKDIR /var/www/api
RUN mkdir -p storage/framework/cache/data storage/framework/views storage/framework/sessions bootstrap/cache
RUN composer install --optimize-autoloader --no-dev --no-scripts
RUN chown -R www-data:www-data /var/www/api/storage /var/www/api/bootstrap/cache

COPY deploy/nginx.conf /etc/nginx/sites-available/default

EXPOSE 80
CMD ["sh", "-c", "service nginx start && php-fpm"]