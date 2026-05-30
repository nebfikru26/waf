
-- Fix 1: Prevent non-admin users from inserting/updating/deleting roles in user_roles
-- The current "Admins can manage roles" ALL policy is permissive, but without
-- restrictive policies, any authenticated user could still insert rows.
-- We need to add restrictive policies that deny non-admin writes.

-- Drop and recreate a cleaner approach: add explicit INSERT/UPDATE/DELETE deny for non-admins
-- by making the existing admin policy the only write path.

-- First, ensure no INSERT policy exists for non-admin users (currently none, but the
-- lack of a restrictive policy means permissive "authenticated" could allow it).
-- We'll add restrictive policies that require admin role for all write operations.

CREATE POLICY "Only admins can insert roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update roles"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Restrict contact_messages inserts to authenticated users only
-- and add field length constraints
DROP POLICY IF EXISTS "Anyone can submit contact messages" ON public.contact_messages;

CREATE POLICY "Authenticated users can submit contact messages"
ON public.contact_messages
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add length constraints to prevent abuse
ALTER TABLE public.contact_messages
ADD CONSTRAINT contact_name_length CHECK (char_length(name) <= 200),
ADD CONSTRAINT contact_email_length CHECK (char_length(email) <= 320),
ADD CONSTRAINT contact_subject_length CHECK (char_length(subject) <= 500),
ADD CONSTRAINT contact_message_length CHECK (char_length(message) <= 5000);
