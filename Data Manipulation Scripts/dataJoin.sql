CREATE OR REPLACE TABLE
  propertytaxmap.EstimatedTaxBills OPTIONS ( expiration_timestamp = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 56 DAY)  -- 8 weeks
    ) AS
WITH
  -- Assembly district boundaries and numbers
  assembly_districts AS (
  SELECT
    assembly_district AS AssemblyDistrictNumber,
    ST_GEOGFROMTEXT(the_geom) AS AssemblyDistrictGeometry
  FROM
    `sidewalk-chorus.propertytaxmap.ASSEMBLY_DISTRICTS`),
  -- Synthetic table for the tax rates
  tax_rates_table AS (
  SELECT
    1 AS TaxClass,
    20.31 / 100 AS TaxRate
  UNION ALL
  SELECT
    2,
    12.27 / 100
  UNION ALL
  SELECT
    3,
    12.76 / 100
  UNION ALL
  SELECT
    4,
    10.65 / 100 ),
  -- Cleanup sales data
  sales_tidied AS (
  SELECT
    CAST(bbl AS STRING) AS bbl,
    CAST(sale_price_adj_se AS FLOAT64) AS most_recent_sale_price_in_current_dollars,
    sale_date,
    sale_month,
    sale_price
  FROM
    `sidewalk-chorus.propertytaxmap.PROPERTY_SALES_ADJ_SE`
  QUALIFY
    ROW_NUMBER() OVER (PARTITION BY bbl ORDER BY sale_date DESC NULLS LAST , sale_price DESC NULLS LAST ) = 1 ),
  -- Aggregation of tax abatements for each property
  abatements_computed AS (
  SELECT
    CAST(parid AS STRING) AS BoroughBlockLot,
    SUM(appliedabt) AS SumOfAppliedAbatements
  FROM
    `sidewalk-chorus.propertytaxmap.ABATEMENTS`
  WHERE
    period = "2Q"
  GROUP BY
    parid),
  -- Extract details on property values and assessments
  pvad_computed AS (
  SELECT
    CAST(pvad.parid AS STRING) AS BoroughBlockLot,
    CAST(pvad.condo_number AS STRING) AS CondoNumber,
    CAST(LEFT(pvad.curtaxclass, 1) AS INT64) AS TaxClass,
    pvad.bldg_class AS BuildingClass,
    (pvad.condo_number IS NOT NULL
      AND pvad.bldg_class != "R0") AS IsCondoUnit,
    pvad.curmkttot AS CurrentMarketTotalValue,
    pvad.curtxbtot AS CurrentTaxableValue,
    pvad.curtxbextot AS CurrentExemptionValue
  FROM
    `sidewalk-chorus.propertytaxmap.PVAD` AS pvad),
  -- Extract details on the characteristics of the property
  pluto_computed AS (
  SELECT
    CAST(pluto.bbl AS STRING) AS BoroughBlockLot,
    pluto.address AS Address,
    pluto.zipcode AS ZipCode,
    pluto.borough AS Borough,
    pluto.ownername AS OwnerName,
    pluto.council AS CouncilDistrict,
    pluto.cd AS CommunityDistrict,
    pluto.latitude AS Latitude,
    pluto.longitude AS Longitude,
    ST_GEOGPOINT(pluto.longitude, pluto.latitude) AS GeoGPoint,
    pluto.yearbuilt AS YearBuilt,
    pluto.unitsres AS ResidentialUnits,
    CONCAT(LEFT(CAST(pluto.bbl AS STRING), 1), pluto.condono) AS CondoNumber -- PLUTO has a per-borough condo number field. We need to combine it with the borocode (first digit of BBL to determine the property's cross-NYC condo number)
  FROM
    `sidewalk-chorus.propertytaxmap.PLUTO` AS pluto),
  computed_data AS (
  SELECT
  IF
    (pvad_computed.CondoNumber IS NOT NULL, pvad_computed.CondoNumber, pvad_computed.BoroughBlockLot) AS PropertyGroupKey,
    MAX(CASE
        WHEN pvad_computed.IsCondoUnit = FALSE THEN pvad_computed.BoroughBlockLot
        ELSE NULL
    END
      ) AS BoroughBlockLot,
    STRING_AGG(pvad_computed.BoroughBlockLot, "|"
    ORDER BY
      pvad_computed.BoroughBlockLot ASC) AS ComponentPropertyBoroughBlockLots,
    ANY_VALUE(pvad_computed.CondoNumber) AS CondoNumber,
    ANY_VALUE(assembly_districts.AssemblyDistrictNumber) AS AssemblyDistrict,
    ANY_VALUE(CouncilDistrict) AS CouncilDistrict,
    ANY_VALUE(CommunityDistrict) AS CommunityDistrict,
    ANY_VALUE(pluto_computed.Latitude) AS Latitude,
    ANY_VALUE(pluto_computed.Longitude) AS Longitude,
    ANY_VALUE(YearBuilt) AS YearBuilt,
    ANY_VALUE(pluto_computed.Address) AS Address,
    ANY_VALUE(OwnerName) AS OwnerName,
    ANY_VALUE(pvad_computed.TaxClass) AS TaxClass,
    ANY_VALUE(pvad_computed.CondoNumber IS NOT NULL) AS IsCondoProperty,
    SUM(pvad_computed.CurrentMarketTotalValue) AS CurrentMarketTotalValue,
    SUM(pvad_computed.CurrentTaxableValue) AS CurrentTaxableValue,
    SUM(pvad_computed.CurrentExemptionValue) AS CurrentExemptionValue,
    SUM(abatements_computed.SumOfAppliedAbatements) AS SumOfAppliedAbatements,
    ROUND(SUM((pvad_computed.CurrentTaxableValue - pvad_computed.CurrentExemptionValue) * tax_rates_table.TaxRate - IFNULL(abatements_computed.SumOfAppliedAbatements, 0)), 2) AS TaxBill,
    ROUND(SAFE_DIVIDE(SUM((pvad_computed.CurrentTaxableValue - pvad_computed.CurrentExemptionValue) * tax_rates_table.TaxRate - IFNULL(abatements_computed.SumOfAppliedAbatements, 0)), SUM(pvad_computed.CurrentMarketTotalValue)),8) AS EffectiveTaxRate,
    ANY_VALUE(sales_tidied.most_recent_sale_price_in_current_dollars) AS MostRecentSalePriceInCurrentDollars,
    ANY_VALUE(sales_tidied.sale_date) AS MostRecentSaleDate,
    ANY_VALUE(sales_tidied.sale_month) AS MostRecentSaleMonth,
    ANY_VALUE(sales_tidied.sale_price) AS MostRecentSalePrice,
  FROM
    pvad_computed
  LEFT JOIN
    -- only keep the properties that are in both PVAD and PLUTO. There are some properties that (for some reason) are not included in PLUTO. This is mostly class 4 utility properties.
    pluto_computed
  ON
    pvad_computed.BoroughBlockLot = pluto_computed.BoroughBlockLot
  LEFT JOIN
    assembly_districts
  ON
    ST_CONTAINS(assembly_districts.AssemblyDistrictGeometry, pluto_computed.GeoGPoint)
  LEFT JOIN
    abatements_computed
  ON
    pvad_computed.BoroughBlockLot = abatements_computed.BoroughBlockLot
  LEFT JOIN
    tax_rates_table
  ON
    pvad_computed.TaxClass = tax_rates_table.TaxClass
  LEFT JOIN
    sales_tidied
  ON
    pvad_computed.BoroughBlockLot = sales_tidied.bbl
  GROUP BY
    PropertyGroupKey )
SELECT
  * EXCEPT (PropertyGroupKey)
FROM
  computed_data
WHERE
  computed_data.Longitude IS NOT NULL
  AND computed_data.Longitude IS NOT NULL;