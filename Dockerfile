# syntax = docker/dockerfile:1

# Make sure RUBY_VERSION matches the Ruby version in .ruby-version and Gemfile
ARG RUBY_VERSION=3.4.9
FROM registry.docker.com/library/ruby:$RUBY_VERSION-slim AS base

# Rails app lives here
WORKDIR /rails

# Install base packages
RUN apt-get update -qq \
    && apt-get install --no-install-recommends -y curl libvips postgresql-client libyaml-0-2 procps libjemalloc2 \
    && rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Set production environment
ARG BUILD_COMMIT_SHA
ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development" \
    BUILD_COMMIT_SHA=${BUILD_COMMIT_SHA}

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build gems
RUN apt-get update -qq \
    && apt-get install --no-install-recommends -y build-essential clang libclang-dev libpq-dev git pkg-config libyaml-dev \
    && rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Rust is required to compile the prql_rb native extension.
ENV PATH="/root/.cargo/bin:${PATH}"
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain 1.89.0

# Install application gems
COPY .ruby-version Gemfile Gemfile.lock ./
COPY gems/prql_rb ./gems/prql_rb
RUN bundle install \
    && bundle exec ruby gems/prql_rb/bin/compile \
    && bundle exec ruby -e 'require "prql_rb"; abort unless PrqlRb.compiler_version == "0.13.14"' \
    && rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git \
    && bundle exec bootsnap precompile --gemfile -j 0

# Copy application code
COPY . .

# Precompile bootsnap code for faster boot times
RUN bundle exec bootsnap precompile -j 0 app/ lib/

# Precompiling assets for production without requiring secret RAILS_MASTER_KEY
RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile

# Final stage for app image
FROM base

# Run and own only the runtime files as a non-root user for security
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash
USER 1000:1000

# Copy built artifacts: gems, application
COPY --chown=rails:rails --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=build /rails /rails

# Entrypoint prepares the database.
ENTRYPOINT ["/rails/bin/docker-entrypoint"]

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD ["./bin/rails", "server"]
