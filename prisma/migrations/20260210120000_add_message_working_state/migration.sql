-- Add working state JSON field for agent message history
ALTER TABLE "ConversationMessage"
ADD COLUMN "working" JSONB;
