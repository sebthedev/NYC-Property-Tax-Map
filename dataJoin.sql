CREATE OR REPLACE TABLE
  propertytaxmap.EstimatedTaxBills AS
WITH
  assembly_districts AS ( -- Assembly district boundaries and numbers
  SELECT
    AssemDist AS AssemblyDistrictNumber,
    ST_GEOGFROMTEXT(the_geom) AS AssemblyDistrictGeometry
  FROM
    `sidewalk-chorus.propertytaxmap.NYC_Assembly_Districts`),
  get_tax_rate AS ( -- Synthetic table for the tax rates
  SELECT
    1 AS tax_class,
    20.31 AS tax_rate
  UNION ALL
  SELECT
    2,
    12.27
  UNION ALL
  SELECT
    3,
    12.76
  UNION ALL
  SELECT
    4,
    10.65 ),
  abatements AS ( -- Aggregation of abatements for each property
  SELECT
    parid,
    COUNT(*) AS DistinctAbatements,
    SUM(appliedabt) AS SumOfAppliedAbatements
  FROM
    `sidewalk-chorus.propertytaxmap.Abatements`
  WHERE
    period = "2Q"
  GROUP BY
    parid),
  precomputed_data AS (
  SELECT
  IF
    (pvad.condo_number IS NOT NULL, CAST(pvad.condo_number AS STRING), pvad.parid) AS PropertyGroupKey,
    pvad.parid AS BoroughBlockLot,
    pluto.address AS Address,
    pluto.zipcode AS ZipCode,
    pluto.borough AS Borough,
    pluto.ownername AS OwnerName,
    -- If the property is a condo unit, determine the name of the unit owner (in addition to the name of the building owner, which is typically the condo association)
  IF
    (pvad.condo_number IS NOT NULL
      AND pvad.bldg_class != "R0", pvad.owner, NULL) AS CondoUnitOwnerName,
    pvad.condo_number AS CondoNumber,
    pluto.council AS CouncilDistrict,
    pluto.cd AS CommunityDistrict,
    assembly_districts.AssemblyDistrictNumber AS AssemblyDistrict,
    pluto.latitude AS Latitude,
    pluto.longitude AS Longitude,
    pluto.yearbuilt AS YearBuilt,
  IF
    (pvad.condo_number IS NOT NULL
      AND pvad.bldg_class != "R0", 1, pluto.unitsres) AS ResidentialUnits,
    pvad.curtaxclass AS TaxClass,
  IF
    (pvad.condo_number IS NOT NULL
      AND pvad.bldg_class != "R0", TRUE, FALSE) AS IsCondoUnit,
    pvad.curmkttot AS CurrentMarketTotalValue,
    pvad.curtxbtot AS CurrentTaxableValue,
    pvad.curtxbextot AS CurrentExemptionValue,
    abatements.DistinctAbatements,
    abatements.SumOfAppliedAbatements,
    ROUND((pvad.curtxbtot - pvad.curtxbextot) * tax_rate_table.tax_rate / 100 - IFNULL(abatements.SumOfAppliedAbatements, 0), 2) AS TaxBill,
    ROUND(SAFE_DIVIDE((pvad.curtxbtot - pvad.curtxbextot) * tax_rate_table.tax_rate / 100 - IFNULL(abatements.SumOfAppliedAbatements, 0), pvad.curmkttot),8) AS EffectiveTaxRate,
  FROM
    `sidewalk-chorus.propertytaxmap.PVAD_2023-11-10_3` AS pvad
  LEFT JOIN
    `sidewalk-chorus.propertytaxmap.PLUTO_2023-11-10` AS pluto
  ON
    -- Join on the BBL if this property is not a condo. Join on the condo_number if this property is a condo
  IF
    (pvad.condo_number IS NOT NULL, CAST(pvad.condo_number AS STRING) = CONCAT(LEFT(CAST(pluto.bbl AS STRING), 1), FORMAT('%05d', pluto.condono)), CAST(pluto.bbl AS STRING) = pvad.parid)
  JOIN
    get_tax_rate AS tax_rate_table
  ON
    pvad.curtaxclass = CAST(tax_rate_table.tax_class AS STRING)
  LEFT JOIN
    abatements
  ON
    pvad.parid = CAST(abatements.parid AS STRING)
    -- Join with Assembly District boundaries
  LEFT JOIN
    assembly_districts
  ON
    ST_CONTAINS(assembly_districts.AssemblyDistrictGeometry, ST_GEOGPOINT(pluto.longitude, pluto.latitude))
    -- WHERE
    --   pvad.condo_number = 100058
    --   OR pvad.parid = "1013960033"
    --   OR pvad.parid = "1013940023"
    )
SELECT
  -- Now group the data together. This allows us to sum up the values and tax bills for condos, which are represented as separate tax units
  MAX(CASE
      WHEN IsCondoUnit = FALSE THEN BoroughBlockLot
    ELSE
    NULL
  END
    ) AS BoroughBlockLot,
  ARRAY_AGG(BoroughBlockLot
  ORDER BY
    BoroughBlockLot ASC) AS ComponentPropertyBoroughBlockLots,
  ANY_VALUE(CondoNumber) AS CondoNumber,
  ANY_VALUE(AssemblyDistrict) AS AssemblyDistrict,
  ANY_VALUE(CouncilDistrict) AS CouncilDistrict,
  ANY_VALUE(CommunityDistrict) AS CommunityDistrict,
  ANY_VALUE(Latitude) AS Latitude,
  ANY_VALUE(Longitude) AS Longitude,
  ANY_VALUE(YearBuilt) AS YearBuilt,
  MAX(CASE
      WHEN IsCondoUnit = FALSE THEN ResidentialUnits
    ELSE
    NULL
  END
    ) AS ResidentialUnits,
  MAX(CASE
      WHEN IsCondoUnit = FALSE THEN TaxClass
    ELSE
    NULL
  END
    ) AS TaxClass,
  SUM(CurrentMarketTotalValue) AS CurrentMarketTotalValue,
  SUM(CurrentTaxableValue) AS CurrentTaxableValue,
  SUM(CurrentExemptionValue) AS CurrentExemptionValue,
  SUM(SumOfAppliedAbatements) AS SumOfAppliedAbatements,
  SUM(TaxBill) AS TaxBill,
  ROUND(SAFE_DIVIDE(SUM(TaxBill), SUM(CurrentMarketTotalValue)), 8) AS EffectiveTaxRate
FROM
  precomputed_data
GROUP BY
  PropertyGroupKey;