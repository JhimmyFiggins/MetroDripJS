
-- db_identity
CREATE TABLE accounts_customer (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    password        VARCHAR(128)    NOT NULL,
    last_login      DATETIME(6)     NULL,
    is_superuser    TINYINT(1)            NOT NULL,
    email           VARCHAR(254)    NOT NULL,
    name            VARCHAR(150)    NOT NULL,
    phone           VARCHAR(32)     NOT NULL,
    addresses       JSON            NOT NULL,
    is_active       TINYINT(1)            NOT NULL,
    role            VARCHAR(16)     NOT NULL,
    date_joined     DATETIME(6)     NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uniq_email (email),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE accounts_wishlistitem (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    customer_id     BIGINT          NOT NULL,
    product_ref     BIGINT          NOT NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT fk_customer_id 
        FOREIGN KEY (customer_id) REFERENCES accounts_customer(id)
        ON DELETE CASCADE,
    INDEX idx_product_ref (product_ref),
    UNIQUE KEY uniq_wishlist_entry (customer_id, product_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE core_serviceevent (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    target_model    VARCHAR(100)    NOT NULL,
    target_field    VARCHAR(100)    NOT NULL,
    reference_id    BIGINT          NOT NULL,
    operation       VARCHAR(8)      NOT NULL,
    created_at      DATETIME(6)     NOT NULL,
    completed_at    DATETIME(6)     NULL,
    attempts        INT UNSIGNED    NOT NULL DEFAULT 0,
    last_error      LONGTEXT        NULL,

    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- db_catalog
CREATE TABLE catalog_category (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    name        VARCHAR(120)    NOT NULL,
    slug        VARCHAR(140)    NOT NULL,
    parent_id   BIGINT          NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uniq_category_slug (slug),
    UNIQUE KEY uniq_category_sibling (parent_id, name),
    CONSTRAINT fk_category_parent
        FOREIGN KEY (parent_id) REFERENCES catalog_category(id)
        ON DELETE SET NULL,
    INDEX idx_parent_slug (parent_id, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE catalog_product (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    name            VARCHAR(200)    NOT NULL,
    slug            VARCHAR(220)    NOT NULL,
    description     LONGTEXT        NOT NULL,
    category_id     BIGINT          NOT NULL,
    base_price      INT UNSIGNED    NOT NULL DEFAULT 0,
    images          JSON            NOT NULL,
    is_active       TINYINT(1)            NOT NULL,
    is_mock         TINYINT(1)            NOT NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uniq_product_slug (slug),
    CONSTRAINT fk_product_category
        FOREIGN KEY (category_id) REFERENCES catalog_category(id)
        ON DELETE RESTRICT,
    INDEX idx_mock (is_mock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE catalog_productvariant (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    product_id      BIGINT          NOT NULL,
    sku             VARCHAR(64)     NOT NULL,
    size            VARCHAR(4)      NOT NULL,
    color           VARCHAR(40)     NOT NULL,
    fit             VARCHAR(10)     NOT NULL,
    price_override  INT UNSIGNED    NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_productvariant_product
        FOREIGN KEY (product_id) REFERENCES catalog_product(id)
        ON DELETE CASCADE,
    UNIQUE KEY uniq_productvariant_sku (sku),
    UNIQUE KEY uniq_variant_axes (product_id, size, color, fit),
    INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_stockrecord (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    variant_id      BIGINT          NOT NULL,
    qty_on_hand     INT UNSIGNED    NOT NULL DEFAULT 0,
    qty_reserved    INT UNSIGNED    NOT NULL DEFAULT 0,
    low_stock_threshold INT UNSIGNED NOT NULL DEFAULT 5,

    PRIMARY KEY (id),
    CONSTRAINT fk_stockrecord_variant
        FOREIGN KEY (variant_id) REFERENCES catalog_productvariant(id)
        ON DELETE CASCADE,
    UNIQUE KEY uniq_stock_variant (variant_id),
    CONSTRAINT chk_stock_integrity CHECK (qty_reserved <= qty_on_hand),
    INDEX idx_variant_id (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_reservation (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    variant_id      BIGINT          NOT NULL,
    qty             INT UNSIGNED    NOT NULL DEFAULT 0,
    status          VARCHAR(9)      NOT NULL,
    session_key     VARCHAR(64)     NOT NULL,
    checkout_id     VARCHAR(64)     NOT NULL,
    order_ref       BIGINT          NULL,
    expires_at      DATETIME(6)     NOT NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ended_at        DATETIME(6)     NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_reservation_variant
        FOREIGN KEY (variant_id) REFERENCES catalog_productvariant(id)
        ON DELETE RESTRICT,
    CONSTRAINT chk_reservation_qty CHECK (qty >= 1),
    CONSTRAINT chk_reservation_status CHECK (status IN ('active', 'committed', 'released', 'expired')),
    INDEX idx_status_expires (status, expires_at),
    INDEX idx_checkout_id (checkout_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_idempotencyrecord (
    key_hash            VARCHAR(64)     NOT NULL,
    request_fingerprint VARCHAR(64)     NOT NULL,
    status_code         SMALLINT UNSIGNED NOT NULL,
    response_body       JSON            NOT NULL,
    created_at          DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (key_hash),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_stockmovement (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    variant_id      BIGINT          NOT NULL,
    delta           INT             NOT NULL,
    reason          VARCHAR(12)     NOT NULL,
    ref_order_ref   BIGINT          NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT fk_stockmovement_variant
        FOREIGN KEY (variant_id) REFERENCES catalog_productvariant(id)
        ON DELETE RESTRICT,
    INDEX idx_ref_order_ref (ref_order_ref),
    CONSTRAINT chk_stockmovement_delta CHECK (
        (reason = 'sale' AND delta < 0) OR
        (reason IN ('restock', 'return') AND delta > 0) OR
        (reason = 'adjustment' AND delta != 0)
    ),
    CONSTRAINT chk_stockmovement_reason CHECK (reason IN ('sale', 'restock', 'adjustment', 'return')),
    INDEX idx_variant_created (variant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- db_orders
CREATE TABLE orders_order (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    order_no        VARCHAR(20)     NOT NULL,
    customer_ref    BIGINT          NULL,
    status          VARCHAR(10)     NOT NULL DEFAULT 'pending',
    subtotal        INT UNSIGNED    NOT NULL DEFAULT 0,
    shipping_fee    INT UNSIGNED    NOT NULL DEFAULT 0,
    total           INT UNSIGNED    NOT NULL DEFAULT 0,
    shipping_address JSON           NOT NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uniq_order_no (order_no),
    CONSTRAINT chk_order_total CHECK (total = subtotal + shipping_fee),
    CONSTRAINT chk_order_status CHECK (status IN ('pending', 'paid', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded')),
    INDEX idx_customer_ref (customer_ref),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orders_orderitem (
    id                      BIGINT          NOT NULL AUTO_INCREMENT,
    order_id                BIGINT          NOT NULL,
    variant_ref             BIGINT          NOT NULL,
    qty                     INT UNSIGNED    NOT NULL DEFAULT 1,
    unit_price_snapshot     INT UNSIGNED    NOT NULL,
    product_ref             BIGINT          NOT NULL,
    sku_snapshot            VARCHAR(64)     NOT NULL,
    product_name_snapshot   VARCHAR(200)    NOT NULL,
    product_slug_snapshot   VARCHAR(220)    NOT NULL,
    size_snapshot           VARCHAR(4)      NOT NULL,
    color_snapshot          VARCHAR(40)     NOT NULL,
    fit_snapshot            VARCHAR(10)     NOT NULL,
    image_url_snapshot      VARCHAR(2048)   NOT NULL,
    snapshot_source         VARCHAR(16)     NOT NULL DEFAULT 'checkout',

    PRIMARY KEY (id),
    CONSTRAINT fk_orderitem_order
        FOREIGN KEY (order_id) REFERENCES orders_order(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_orderitem_variant
        FOREIGN KEY (variant_ref) REFERENCES catalog_productvariant(id)
        ON DELETE RESTRICT,
    UNIQUE KEY uniq_order_variant (order_id, variant_ref),
    CONSTRAINT chk_orderitem_qty CHECK (qty >= 1),
    INDEX idx_product_ref (product_ref),
    INDEX idx_order_created (order_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orders_ordernumbersequence (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    year        INT UNSIGNED    NOT NULL,
    last_value  INT UNSIGNED    NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    UNIQUE KEY uniq_year (year),
    CONSTRAINT chk_year_range CHECK (year >= 1000 AND year <= 9999),
    CONSTRAINT chk_last_value CHECK (last_value <= 99999)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orders_stockhold (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    order_id        BIGINT          NOT NULL,
    checkout_id     VARCHAR(64)     NOT NULL,
    state           VARCHAR(9)      NOT NULL DEFAULT 'active',
    expires_at      DATETIME(6)     NOT NULL,
    committed_at    DATETIME(6)     NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT fk_stockhold_order
        FOREIGN KEY (order_id) REFERENCES orders_order(id)
        ON DELETE CASCADE,
    UNIQUE KEY uniq_checkout (checkout_id),
    CONSTRAINT chk_stockhold_state CHECK (state IN ('active', 'committed', 'released', 'unknown')),
    INDEX idx_state_expires (state, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orders_outboxmessage (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    topic           VARCHAR(48)     NOT NULL,
    payload         JSON            NOT NULL,
    state           VARCHAR(7)      NOT NULL DEFAULT 'pending',
    attempts        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    correlation_id  VARCHAR(128)    NULL,
    last_error      LONGTEXT        NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    sent_at         DATETIME(6)     NULL,

    PRIMARY KEY (id),
    CONSTRAINT chk_outbox_state CHECK (state IN ('pending', 'sent', 'dead')),
    INDEX idx_dispatch (state, next_attempt_at),
    INDEX idx_correlation (correlation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE payments_payment (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    order_id        BIGINT          NOT NULL,
    provider_ref    VARCHAR(128)    NULL,
    method          VARCHAR(8)      NOT NULL,
    status          VARCHAR(10)     NOT NULL DEFAULT 'pending',
    amount          INT UNSIGNED    NOT NULL,
    paid_at         DATETIME(6)     NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_payment_order
        FOREIGN KEY (order_id) REFERENCES orders_order(id)
        ON DELETE CASCADE,
    UNIQUE KEY uniq_provider_ref (provider_ref),
    UNIQUE KEY uniq_order_payment (order_id),
    CONSTRAINT chk_payment_method CHECK (method IN ('card', 'gcash', 'maya')),
    CONSTRAINT chk_payment_status CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    CONSTRAINT chk_payment_amount CHECK (amount > 0),
    INDEX idx_provider_ref (provider_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE reviews_review (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    customer_ref    BIGINT          NOT NULL,
    product_ref     BIGINT          NOT NULL,
    order_id        BIGINT          NOT NULL,
    rating          SMALLINT UNSIGNED NOT NULL,
    body            LONGTEXT        NOT NULL DEFAULT '',
    status          VARCHAR(10)     NOT NULL DEFAULT 'pending',
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT fk_review_customer
        FOREIGN KEY (customer_ref) REFERENCES accounts_customer(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_review_product
        FOREIGN KEY (product_ref) REFERENCES catalog_product(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_review_order
        FOREIGN KEY (order_id) REFERENCES orders_order(id)
        ON DELETE RESTRICT,
    UNIQUE KEY uniq_customer_product (customer_ref, product_ref),
    CONSTRAINT chk_review_rating CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT chk_review_status CHECK (status IN ('pending', 'approved', 'rejected')),
    INDEX idx_product_reviews (product_ref, status),
    INDEX idx_customer_reviews (customer_ref, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- db_fulfillment
CREATE TABLE shipping_shippingzone (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    name        VARCHAR(50)     NOT NULL,
    fee         INT UNSIGNED    NOT NULL DEFAULT 0,
    is_active   TINYINT(1)            NOT NULL DEFAULT TRUE,

    PRIMARY KEY (id),
    UNIQUE KEY uniq_zone_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE shipping_shipment (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    order_ref       BIGINT          NOT NULL,
    courier         VARCHAR(20)     NOT NULL,
    waybill_no      VARCHAR(64)     NOT NULL,
    tracking_url    VARCHAR(254)    NULL,
    status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
    booked_at       DATETIME(6)     NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uniq_shipment_order (order_ref),
    CONSTRAINT chk_shipment_status CHECK (status IN ('pending', 'booked', 'in_transit', 'out_for_delivery', 'delivered', 'failed')),
    INDEX idx_order_ref (order_ref),
    INDEX idx_courier (courier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notifications_devicetoken (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    customer_ref    BIGINT          NOT NULL,
    token           VARCHAR(200)    NOT NULL,
    platform        VARCHAR(10)     NOT NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_seen_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT fk_devicetoken_customer
        FOREIGN KEY (customer_ref) REFERENCES accounts_customer(id)
        ON DELETE CASCADE,
    UNIQUE KEY uniq_token_platform (token, platform),
    CONSTRAINT chk_device_platform CHECK (platform IN ('ios', 'android')),
    INDEX idx_customer_token (customer_ref, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notifications_notification (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    customer_ref    BIGINT          NOT NULL,
    title           VARCHAR(140)    NOT NULL,
    body            LONGTEXT        NOT NULL,
    category        VARCHAR(10)     NOT NULL,
    order_ref       BIGINT          NULL,
    is_read         TINYINT(1)            NOT NULL DEFAULT FALSE,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT fk_notification_customer
        FOREIGN KEY (customer_ref) REFERENCES accounts_customer(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_notification_category CHECK (category IN ('order', 'drop', 'stock', 'review')),
    INDEX idx_inbox (customer_ref, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- db_content
CREATE TABLE cms_homepagebanner (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    title       VARCHAR(200)    NOT NULL,
    image_url   VARCHAR(254)    NOT NULL,
    link_url    VARCHAR(200)    NOT NULL,
    is_active   TINYINT(1)            NOT NULL DEFAULT TRUE,
    `order`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    INDEX idx_order_active (`order`, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE cms_contactmessage (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    name        VARCHAR(150)    NOT NULL,
    email       VARCHAR(254)    NOT NULL,
    message     LONGTEXT        NOT NULL,
    is_resolved TINYINT(1)            NOT NULL DEFAULT FALSE,
    created_at  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    INDEX idx_resolved (is_resolved, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;