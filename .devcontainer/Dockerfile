ARG RUBY_VERSION=3.4.9
FROM ruby:${RUBY_VERSION}-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# libvips42 supports ActiveStorage image variants through image_processing/ruby-vips
# for existing profile/avatar images. AccountStatement.original_file only stores
# PDF/CSV/XLSX originals, but the devcontainer needs this broader image stack.
# libclang-dev/clang are required by bindgen to build the prql_rb Rust extension.
RUN apt-get update -qq \
  && apt-get -y install --no-install-recommends \
    apt-utils \
    build-essential \
    clang \
    curl \
    git \
    imagemagick \
    iproute2 \
    libclang-dev \
    libvips42 \
    libpq-dev \
    libyaml-dev \
    libyaml-0-2 \
    openssh-client \
    postgresql-client \
    vim \
    procps \
  && rm -rf /var/lib/apt/lists /var/cache/apt/archives

RUN gem install bundler foreman

# Rust toolchain: prql_rb is currently consumed from its git source,
# so bundle install compiles the native extension. Once prql_rb ships
# prebuilt platform gems on RubyGems.org, this can be dropped.
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable --no-modify-path \
  && chmod -R a+rwX /usr/local/cargo /usr/local/rustup \
  && rustc --version

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists /var/cache/apt/archives

WORKDIR /workspace
