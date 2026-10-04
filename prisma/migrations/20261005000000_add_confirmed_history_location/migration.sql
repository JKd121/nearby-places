-- Keep legacy rows intact. New history writes require a complete confirmed location.
ALTER TABLE "SearchHistory" ADD COLUMN "confirmedLocation" JSONB;
