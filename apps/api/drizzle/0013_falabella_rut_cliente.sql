-- Falabella: completa el RUT del cliente (y los datos de factura) en las ventas ya cargadas,
-- leyéndolos del archivo original guardado en "raw". Las cargas nuevas ya lo traen.
UPDATE "sales_records" s
SET "customer_document" = upper(nullif(trim(s."raw"->>'N° Documento del cliente'), ''))
FROM "retailers" r
WHERE r."id" = s."retailer_id"
  AND r."code" = 'FALABELLA'
  AND s."customer_document" IS NULL
  AND nullif(trim(s."raw"->>'N° Documento del cliente'), '') IS NOT NULL;
--> statement-breakpoint
UPDATE "sales_records" s
SET
  "billing_tax_id" = left(CASE
    WHEN position('-' in s."raw"->>'N° documento para facturacion') > 0
      THEN upper(replace(replace(trim(s."raw"->>'N° documento para facturacion'), '.', ''), ' ', ''))
    ELSE upper(replace(replace(trim(s."raw"->>'N° documento para facturacion'), '.', ''), ' ', ''))
      || coalesce('-' || nullif(upper(trim(s."raw"->>'Digito verificador para facturacion')), ''), '')
  END, 20),
  "billing_legal_name" = left(coalesce(
    nullif(trim(s."raw"->>'Nombre Legal para facturacion'), ''),
    nullif(trim(s."raw"->>'Nombre de facturacion'), '')), 200),
  "billing_activity" = left(nullif(trim(s."raw"->>'Actividad Economica para facturacion'), ''), 200),
  "billing_address" = nullif(concat_ws(' ',
    coalesce(
      nullif(trim(s."raw"->>'Dirección para facturacion'), ''),
      nullif(concat_ws(' ',
        nullif(trim(s."raw"->>'Direccion de facturacion'), ''),
        nullif(trim(s."raw"->>'Direccion de facturacion 2'), ''),
        nullif(trim(s."raw"->>'Direccion de facturacion 3'), '')), '')),
    coalesce(
      nullif(trim(s."raw"->>'Comuna/Distrito/Localidad para facturacion'), ''),
      nullif(trim(s."raw"->>'Comuna/Distrito/Localidad de facturacion'), ''))), '')
FROM "retailers" r
WHERE r."id" = s."retailer_id"
  AND r."code" = 'FALABELLA'
  AND s."billing_tax_id" IS NULL
  AND nullif(trim(s."raw"->>'N° documento para facturacion'), '') IS NOT NULL
  AND (upper(coalesce(s."raw"->>'Documento requerido', '')) LIKE '%FACTURA%'
    OR upper(coalesce(s."raw"->>'Tipo de documento para facturacion', '')) LIKE '%FACTURA%');