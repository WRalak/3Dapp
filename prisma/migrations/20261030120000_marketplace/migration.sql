-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ModelRepresentation" AS ENUM ('ACCURATE', 'ILLUSTRATIVE');

-- CreateEnum
CREATE TYPE "SellerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SellerBusinessType" AS ENUM ('DESIGNER', 'BOUTIQUE', 'BRAND', 'MANUFACTURER', 'RETAILER');

-- CreateEnum
CREATE TYPE "SellerDocumentType" AS ENUM ('BUSINESS_REGISTRATION', 'KRA_PIN', 'NATIONAL_ID', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationDecision" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUSPENDED', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('SAME_DAY', 'NEXT_DAY', 'STANDARD', 'COURIER', 'PICKUP', 'SELLER_ARRANGED');

-- CreateEnum
CREATE TYPE "PaymentTxnType" AS ENUM ('INITIATE', 'CALLBACK', 'STATUS_QUERY', 'C2B_VALIDATION', 'C2B_CONFIRMATION', 'CAPTURE', 'REFUND');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('ACCRUED', 'PARTIALLY_REVERSED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('MPESA', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('ORDER_PAYMENT', 'SELLER_EARNING', 'COMMISSION', 'EARNING_RELEASE', 'REFUND', 'SELLER_DEBIT', 'COMMISSION_REVERSAL', 'PAYOUT', 'PAYOUT_REVERSAL', 'ADJUSTMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SELLER';
ALTER TYPE "NotificationType" ADD VALUE 'INQUIRY';
ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShipmentStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "ShipmentStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "building" TEXT,
ADD COLUMN     "countyId" TEXT,
ADD COLUMN     "directions" TEXT,
ADD COLUMN     "estate" TEXT,
ADD COLUMN     "town" TEXT;

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "sellerId" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "commissionRateBps" INTEGER;

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "isCampaign" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sellerId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "countyId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "sellerOrderId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "sellerId" TEXT; -- made NOT NULL after the backfill below

-- AlterTable
ALTER TABLE "ProductModel3D" ADD COLUMN     "representation" "ModelRepresentation" NOT NULL DEFAULT 'ACCURATE';

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "sellerOrderId" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "sellerOrderId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en-KE',
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" "SellerBusinessType" NOT NULL DEFAULT 'DESIGNER',
    "status" "SellerStatus" NOT NULL DEFAULT 'PENDING',
    "countyId" TEXT,
    "town" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "commissionRateBps" INTEGER,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "categories" TEXT[],
    "registrationNumber" TEXT,
    "kraPin" TEXT,
    "returnPolicy" TEXT,
    "payoutMethod" "PayoutMethod" NOT NULL DEFAULT 'MPESA',
    "payoutMpesaPhone" TEXT,
    "payoutBankName" TEXT,
    "payoutAccountName" TEXT,
    "payoutAccountNumberEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerDocument" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" "SellerDocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerVerification" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "decision" "VerificationDecision" NOT NULL,
    "notes" TEXT,
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerFollow" (
    "userId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerFollow_pkey" PRIMARY KEY ("userId","sellerId")
);

-- CreateTable
CREATE TABLE "SellerInquiry" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "subject" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InquiryMessage" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InquiryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReport" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ProductReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "type" "PromotionType" NOT NULL,
    "value" INTEGER NOT NULL,
    "sellerIds" TEXT[],
    "categoryIds" TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "County" (
    "id" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'KE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "County_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "towns" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZoneCounty" (
    "zoneId" TEXT NOT NULL,
    "countyId" TEXT NOT NULL,

    CONSTRAINT "DeliveryZoneCounty_pkey" PRIMARY KEY ("zoneId","countyId")
);

-- CreateTable
CREATE TABLE "ShippingMethod" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "type" "DeliveryType" NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "freeOverCents" INTEGER,
    "minDays" INTEGER NOT NULL DEFAULT 0,
    "maxDays" INTEGER NOT NULL DEFAULT 3,
    "cutoffHour" INTEGER,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "pickupAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL DEFAULT 0,
    "sellerNetCents" INTEGER NOT NULL DEFAULT 0,
    "shippingMethodId" TEXT,
    "shippingMethodName" TEXT NOT NULL,
    "deliveryType" "DeliveryType" NOT NULL DEFAULT 'STANDARD',
    "etaMinDays" INTEGER NOT NULL DEFAULT 0,
    "etaMaxDays" INTEGER NOT NULL DEFAULT 3,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "earningsReleasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentTracking" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "type" "PaymentTxnType" NOT NULL,
    "status" TEXT NOT NULL,
    "providerReference" TEXT,
    "receipt" TEXT,
    "phone" TEXT,
    "amountCents" INTEGER,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "sellerOrderId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "baseCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reversedCents" INTEGER NOT NULL DEFAULT 0,
    "status" "CommissionStatus" NOT NULL DEFAULT 'ACCRUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerWallet" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "pendingCents" BIGINT NOT NULL DEFAULT 0,
    "availableCents" BIGINT NOT NULL DEFAULT 0,
    "reservedCents" BIGINT NOT NULL DEFAULT 0,
    "lifetimeNetCents" BIGINT NOT NULL DEFAULT 0,
    "paidOutCents" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerPayout" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "reference" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedById" TEXT,

    CONSTRAINT "SellerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformTransaction" (
    "id" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "account" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'KES',
    "sellerId" TEXT,
    "orderId" TEXT,
    "sellerOrderId" TEXT,
    "payoutId" TEXT,
    "refundId" TEXT,
    "description" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Seller_ownerId_key" ON "Seller"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_slug_key" ON "Seller"("slug");

-- CreateIndex
CREATE INDEX "Seller_status_idx" ON "Seller"("status");

-- CreateIndex
CREATE INDEX "Seller_countyId_idx" ON "Seller"("countyId");

-- CreateIndex
CREATE INDEX "Seller_isFeatured_idx" ON "Seller"("isFeatured");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_sellerId_key" ON "SellerProfile"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerDocument_fileKey_key" ON "SellerDocument"("fileKey");

-- CreateIndex
CREATE INDEX "SellerDocument_sellerId_idx" ON "SellerDocument"("sellerId");

-- CreateIndex
CREATE INDEX "SellerVerification_sellerId_createdAt_idx" ON "SellerVerification"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "SellerFollow_sellerId_idx" ON "SellerFollow"("sellerId");

-- CreateIndex
CREATE INDEX "SellerInquiry_sellerId_status_idx" ON "SellerInquiry"("sellerId", "status");

-- CreateIndex
CREATE INDEX "SellerInquiry_customerId_idx" ON "SellerInquiry"("customerId");

-- CreateIndex
CREATE INDEX "InquiryMessage_inquiryId_createdAt_idx" ON "InquiryMessage"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReport_status_createdAt_idx" ON "ProductReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneVerification_userId_createdAt_idx" ON "PhoneVerification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_slug_key" ON "Promotion"("slug");

-- CreateIndex
CREATE INDEX "Promotion_isActive_idx" ON "Promotion"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "County_code_key" ON "County"("code");

-- CreateIndex
CREATE UNIQUE INDEX "County_name_key" ON "County"("name");

-- CreateIndex
CREATE UNIQUE INDEX "County_slug_key" ON "County"("slug");

-- CreateIndex
CREATE INDEX "DeliveryZone_sellerId_idx" ON "DeliveryZone"("sellerId");

-- CreateIndex
CREATE INDEX "DeliveryZoneCounty_countyId_idx" ON "DeliveryZoneCounty"("countyId");

-- CreateIndex
CREATE INDEX "ShippingMethod_zoneId_idx" ON "ShippingMethod"("zoneId");

-- CreateIndex
CREATE INDEX "SellerOrder_sellerId_status_idx" ON "SellerOrder"("sellerId", "status");

-- CreateIndex
CREATE INDEX "SellerOrder_status_createdAt_idx" ON "SellerOrder"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellerOrder_orderId_sellerId_key" ON "SellerOrder"("orderId", "sellerId");

-- CreateIndex
CREATE INDEX "ShipmentTracking_shipmentId_occurredAt_idx" ON "ShipmentTracking"("shipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_paymentId_idx" ON "PaymentTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_providerReference_idx" ON "PaymentTransaction"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_provider_type_receipt_key" ON "PaymentTransaction"("provider", "type", "receipt");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_sellerOrderId_key" ON "Commission"("sellerOrderId");

-- CreateIndex
CREATE INDEX "Commission_sellerId_createdAt_idx" ON "Commission"("sellerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellerWallet_sellerId_key" ON "SellerWallet"("sellerId");

-- CreateIndex
CREATE INDEX "SellerPayout_sellerId_status_idx" ON "SellerPayout"("sellerId", "status");

-- CreateIndex
CREATE INDEX "SellerPayout_status_requestedAt_idx" ON "SellerPayout"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "PlatformTransaction_sellerId_createdAt_idx" ON "PlatformTransaction"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformTransaction_type_createdAt_idx" ON "PlatformTransaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformTransaction_orderId_idx" ON "PlatformTransaction"("orderId");

-- CreateIndex
CREATE INDEX "Brand_sellerId_idx" ON "Brand"("sellerId");

-- CreateIndex
CREATE INDEX "Collection_sellerId_idx" ON "Collection"("sellerId");

-- CreateIndex
CREATE INDEX "OrderItem_sellerOrderId_idx" ON "OrderItem"("sellerOrderId");

-- CreateIndex
CREATE INDEX "OrderItem_sellerId_idx" ON "OrderItem"("sellerId");

-- CreateIndex
CREATE INDEX "Product_sellerId_status_idx" ON "Product"("sellerId", "status");

-- CreateIndex
CREATE INDEX "Product_approvalStatus_idx" ON "Product"("approvalStatus");

-- CreateIndex
CREATE INDEX "Shipment_sellerOrderId_idx" ON "Shipment"("sellerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- ─────────────────────────────────────────────────────────────
-- Backfill (hand-written): existing single-vendor data becomes the
-- "House Collection" seller so the upgrade is non-destructive.
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  owner_id text;
  house_id text := 'house-seller';
BEGIN
  IF EXISTS (SELECT 1 FROM "Product") THEN
    SELECT u.id INTO owner_id FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u.id
      JOIN "Role" r ON r.id = ur."roleId"
      WHERE r.key = 'SUPER_ADMIN' ORDER BY u."createdAt" LIMIT 1;
    IF owner_id IS NULL THEN
      SELECT id INTO owner_id FROM "User" ORDER BY "createdAt" LIMIT 1;
    END IF;
    IF owner_id IS NULL THEN
      INSERT INTO "User" (id, email, "updatedAt") VALUES ('house-owner', 'house-owner@marketplace.invalid', now()) RETURNING id INTO owner_id;
    END IF;

    INSERT INTO "Seller" (id, "ownerId", slug, "businessName", "businessType", status, "approvedAt", "updatedAt")
      VALUES (house_id, owner_id, 'house-collection', 'House Collection', 'BRAND', 'APPROVED', now(), now());
    INSERT INTO "SellerProfile" (id, "sellerId", "contactName", email, phone, description, "updatedAt")
      SELECT 'house-profile', house_id, 'Marketplace team', email, '+254700000000', 'Products listed before the marketplace launch.', now()
      FROM "User" WHERE id = owner_id;
    INSERT INTO "SellerWallet" (id, "sellerId", "updatedAt") VALUES ('house-wallet', house_id, now());

    UPDATE "Product" SET "sellerId" = house_id, "approvalStatus" = 'APPROVED', "reviewedAt" = now();

    INSERT INTO "SellerOrder" (id, "orderId", "sellerId", status, "subtotalCents", "shippingCents", "totalCents", "sellerNetCents", "shippingMethodName", "createdAt", "updatedAt")
      SELECT 'so_' || o.id, o.id, house_id, o.status, o."subtotalCents", o."shippingCents", o."subtotalCents" + o."shippingCents",
             o."subtotalCents" + o."shippingCents", o."shippingMethod", o."placedAt", now()
      FROM "Order" o;
    UPDATE "OrderItem" SET "sellerOrderId" = 'so_' || "orderId", "sellerId" = house_id;
    UPDATE "Shipment" SET "sellerOrderId" = 'so_' || "orderId";
  END IF;
END $$;

ALTER TABLE "Product" ALTER COLUMN "sellerId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seller" ADD CONSTRAINT "Seller_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seller" ADD CONSTRAINT "Seller_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerDocument" ADD CONSTRAINT "SellerDocument_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerVerification" ADD CONSTRAINT "SellerVerification_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerVerification" ADD CONSTRAINT "SellerVerification_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerFollow" ADD CONSTRAINT "SellerFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerFollow" ADD CONSTRAINT "SellerFollow_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerInquiry" ADD CONSTRAINT "SellerInquiry_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerInquiry" ADD CONSTRAINT "SellerInquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerInquiry" ADD CONSTRAINT "SellerInquiry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryMessage" ADD CONSTRAINT "InquiryMessage_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "SellerInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryMessage" ADD CONSTRAINT "InquiryMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReport" ADD CONSTRAINT "ProductReport_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReport" ADD CONSTRAINT "ProductReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneVerification" ADD CONSTRAINT "PhoneVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZoneCounty" ADD CONSTRAINT "DeliveryZoneCounty_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZoneCounty" ADD CONSTRAINT "DeliveryZoneCounty_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingMethod" ADD CONSTRAINT "ShippingMethod_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentTracking" ADD CONSTRAINT "ShipmentTracking_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerWallet" ADD CONSTRAINT "SellerWallet_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerPayout" ADD CONSTRAINT "SellerPayout_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerPayout" ADD CONSTRAINT "SellerPayout_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTransaction" ADD CONSTRAINT "PlatformTransaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTransaction" ADD CONSTRAINT "PlatformTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTransaction" ADD CONSTRAINT "PlatformTransaction_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "SellerPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Integrity guards (hand-written)
-- ─────────────────────────────────────────────────────────────
CREATE TRIGGER platform_transaction_append_only
  BEFORE UPDATE OR DELETE ON "PlatformTransaction"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER seller_verification_append_only
  BEFORE UPDATE OR DELETE ON "SellerVerification"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

ALTER TABLE "Seller" ADD CONSTRAINT seller_commission_range CHECK ("commissionRateBps" IS NULL OR "commissionRateBps" BETWEEN 0 AND 10000);
ALTER TABLE "Category" ADD CONSTRAINT category_commission_range CHECK ("commissionRateBps" IS NULL OR "commissionRateBps" BETWEEN 0 AND 10000);
ALTER TABLE "Commission" ADD CONSTRAINT commission_amounts CHECK ("amountCents" >= 0 AND "reversedCents" >= 0 AND "reversedCents" <= "amountCents");
ALTER TABLE "SellerPayout" ADD CONSTRAINT payout_amount_positive CHECK ("amountCents" > 0);
ALTER TABLE "SellerWallet" ADD CONSTRAINT wallet_reserved_non_negative CHECK ("reservedCents" >= 0 AND "pendingCents" >= 0);
ALTER TABLE "ShippingMethod" ADD CONSTRAINT shipping_method_sane CHECK ("priceCents" >= 0 AND "minDays" >= 0 AND "maxDays" >= "minDays" AND ("cutoffHour" IS NULL OR "cutoffHour" BETWEEN 0 AND 23));
ALTER TABLE "SellerOrder" ADD CONSTRAINT seller_order_amounts CHECK ("totalCents" >= 0 AND "commissionCents" >= 0);
ALTER TABLE "Promotion" ADD CONSTRAINT promotion_value CHECK ("value" > 0 AND ("type" <> 'PERCENTAGE' OR "value" <= 90));
