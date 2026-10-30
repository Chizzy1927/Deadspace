-- Hand-edited (see docs/ARCHITECTURE.md §4): enables PostGIS and makes every *Geog column a
-- STORED generated geography point derived from its lat/lng columns. App code writes lat/lng only.
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "TrailerType" AS ENUM ('DRY_VAN', 'REEFER', 'FLATBED');

-- CreateEnum
CREATE TYPE "LoadState" AS ENUM ('EMPTY', 'PARTIAL');

-- CreateEnum
CREATE TYPE "TruckPricingBasis" AS ENUM ('FLAT', 'PER_LOADED_MILE');

-- CreateTable
CREATE TABLE "TruckLeg" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "originLabel" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "originGeog" geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("originLng", "originLat"), 4326)::geography) STORED,
    "destinationLabel" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "destinationGeog" geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("destinationLng", "destinationLat"), 4326)::geography) STORED,
    "departureEarliest" TIMESTAMPTZ(3) NOT NULL,
    "departureLatest" TIMESTAMPTZ(3) NOT NULL,
    "arriveBy" TIMESTAMPTZ(3),
    "loadState" "LoadState" NOT NULL,
    "trailerType" "TrailerType" NOT NULL,
    "totalPallets" INTEGER NOT NULL,
    "totalWeightLbs" INTEGER NOT NULL,
    "committedPallets" INTEGER NOT NULL DEFAULT 0,
    "committedWeightLbs" INTEGER NOT NULL DEFAULT 0,
    "maxDetourMiles" INTEGER NOT NULL DEFAULT 100,
    "pricingBasis" "TruckPricingBasis" NOT NULL,
    "priceAmount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TruckLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportRequest" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "pickupLabel" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupGeog" geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("pickupLng", "pickupLat"), 4326)::geography) STORED,
    "dropoffLabel" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "dropoffGeog" geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("dropoffLng", "dropoffLat"), 4326)::geography) STORED,
    "pickupEarliest" TIMESTAMPTZ(3) NOT NULL,
    "pickupLatest" TIMESTAMPTZ(3) NOT NULL,
    "deliverBy" TIMESTAMPTZ(3),
    "trailerType" "TrailerType" NOT NULL,
    "pallets" INTEGER NOT NULL,
    "weightLbs" INTEGER NOT NULL,
    "maxBudget" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeocodeCache" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TruckLeg_status_trailerType_departureEarliest_idx" ON "TruckLeg"("status", "trailerType", "departureEarliest");

-- CreateIndex
CREATE INDEX "TruckLeg_originGeog_idx" ON "TruckLeg" USING GIST ("originGeog");

-- CreateIndex
CREATE INDEX "TruckLeg_destinationGeog_idx" ON "TruckLeg" USING GIST ("destinationGeog");

-- CreateIndex
CREATE INDEX "TransportRequest_pickupGeog_idx" ON "TransportRequest" USING GIST ("pickupGeog");

-- CreateIndex
CREATE INDEX "TransportRequest_dropoffGeog_idx" ON "TransportRequest" USING GIST ("dropoffGeog");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodeCache_provider_normalizedQuery_rank_key" ON "GeocodeCache"("provider", "normalizedQuery", "rank");
