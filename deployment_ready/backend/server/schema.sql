CREATE TABLE IF NOT EXISTS organizations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    brand VARCHAR(150) NOT NULL,
    model VARCHAR(150) NOT NULL,
    serialNumber VARCHAR(150) NOT NULL,
    ipAddress VARCHAR(50) DEFAULT '',
    macAddress VARCHAR(50) DEFAULT '',
    status VARCHAR(50) NOT NULL,
    specification TEXT,
    purchaseDate DATE,
    cargo VARCHAR(200) DEFAULT '',
    responsable VARCHAR(200) DEFAULT '',
    ubicacion VARCHAR(200) DEFAULT '',
    organizationId INT NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '',
    ai_report TEXT DEFAULT NULL,
    ai_report_date DATETIME DEFAULT NULL,
    UNIQUE KEY (serialNumber, organizationId),
    PRIMARY KEY (id, organizationId),
    FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS software_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assetId VARCHAR(50) NOT NULL,
    organizationId INT NOT NULL DEFAULT 1,
    name VARCHAR(250) NOT NULL,
    version VARCHAR(100) DEFAULT '',
    licensed TINYINT(1) DEFAULT 1,
    licenseKey VARCHAR(250) DEFAULT NULL,
    licenseType VARCHAR(100) NOT NULL,
    FOREIGN KEY (assetId, organizationId) REFERENCES assets(id, organizationId) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
