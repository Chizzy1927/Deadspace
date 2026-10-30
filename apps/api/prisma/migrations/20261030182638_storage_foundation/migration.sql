-- Hand-edited (see docs/ARCHITECTURE.md §4): each locationGeog column is a STORED generated
-- geography point derived from its lat/lng columns (Prisma emitted a plain DEFAULT). App code
-- writes lat/lng only.

-- CreateEnum
CREATE TYPE "StoragePricingPeriod" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- CreateTable
CREATE TABLE "WarehouseSpace" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "locationLabel" TEXT NOT NULL,
    "locationLat" DOUBLE PRECISION NOT NULL,
    "locationLng" DOUBLE PRECISION NOT NULL,
    "locationGeog" geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("locationLng", "locationLat"), 4326)::geography) STORED,
    "quantityAvailable" INTEGER NOT NULL,
    "minPallets" INTEGER,
    "availableFrom" DATE NOT NULL,
    "availableTo" DATE NOT NULL,
    "minStorageDays" INTEGER NOT NULL DEFAULT 1,
    "temperatureControlled" BOOLEAN NOT NULL DEFAULT false,
    "foodGrade" BOOLEAN NOT NULL DEFAULT false,
    "pricingPeriod" "StoragePricingPeriod" NOT NULL,
    "pricePerPalletPerPeriod" DECIMAL(10,2) NOT NULL,
    "handlingFeePerPallet" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WarehouseSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageRequest" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "locationLabel" TEXT NOT NULL,
    "locationLat" DOUBLE PRECISION NOT NULL,
    "locationLng" DOUBLE PRECISION NOT NULL,
    "locationGeog" geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("locationLng", "locationLat"), 4326)::geography) STORED,
    "maxDistanceMiles" INTEGER NOT NULL DEFAULT 25,
    "pallets" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "needsTemperatureControl" BOOLEAN NOT NULL DEFAULT false,
    "needsFoodGrade" BOOLEAN NOT NULL DEFAULT false,
    "maxBudgetTotal" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StorageRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseSpace_status_availableFrom_idx" ON "WarehouseSpace"("status", "availableFrom");

-- CreateIndex
CREATE INDEX "WarehouseSpace_locationGeog_idx" ON "WarehouseSpace" USING GIST ("locationGeog");

-- CreateIndex
CREATE INDEX "StorageRequest_locationGeog_idx" ON "StorageRequest" USING GIST ("locationGeog");
