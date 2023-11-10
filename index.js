let map
let datasetLayer

const mapId = '33d6428f2a3923ea'
const datasetId = '11e3d934-7cb3-42ed-87d9-95cb1034ce20'

const boundsOfNYC = {
  north: 41.20,
  south: 40.40309,
  west: -74.47253,
  east: -73.56091
}

let selectedPropertyBBL = null
let zoomLevelAtWhichStylesMostRecentlyApplied = null

// Determine the map's starting position and zoom level from the URL's hash, or fallback to a default location and zoom level
function getMapParametersFromHash () {
  const defaults = {
    lat: 40.76882764497733,
    lng: -73.96813178859476,
    zoom: 16,
    selectedPropertyBBL: null
  }

  const hash = window.location.hash
  if (hash.startsWith('#!')) {
    const params = {}
    const regExp = /[\#|&]([^=]+)=([^&]+)/g
    let match

    while ((match = regExp.exec(hash)) !== null) {
      params[match[1]] = parseFloat(match[2])
    }

    return {
      lat: params.lat || defaults.lat,
      lng: params.lng || defaults.lng,
      zoom: params.zoom || defaults.zoom
    }
  }

  return defaults
}

async function initMap () {
  const { Map } = await google.maps.importLibrary('maps')

  const mapParameters = getMapParametersFromHash()

  // Create the map
  map = new Map(document.getElementById('map'), {
    center: {
      lat: mapParameters.lat,
      lng: mapParameters.lng
    },
    zoom: mapParameters.zoom,
    minZoom: 13,
    restriction: {
      latLngBounds: boundsOfNYC,
      strictBounds: false
    },
    mapId,
    greedy: 'greedy',
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false
  })

  // Attach the property tax dataset to the map
  datasetLayer = map.getDatasetFeatureLayer(datasetId)

  // Determine the style of each point in the dataset using the setOnMapPropertyStyle function
  datasetLayer.style = setOnMapPropertyStyle

  // Register the function to update the pane showing property details upon clicking on a property on the map
  datasetLayer.addListener('click', handlePropertyClickOnMap)

  map.addListener('click', handleClickOnMap)

  // Register the function to update the URL hash upon adjusting the map position or zoom
  map.addListener('idle', updateUrlHash)

  // Register the function to recompute property styles when the zoom level changes
  map.addListener('zoom_changed', handleZoomChanged)
}

const updateUrlHash = function () {
// Get the map position
  const center = map.getCenter()
  const zoom = map.getZoom()

  let bblHashComponent = ''
  if (selectedPropertyBBL !== null) {
    bblHashComponent = `&bbl=${selectedPropertyBBL}`
  }
  // Update the URL hash with the new center
  window.location.hash = `#!lat=${center.lat()}&lng=${center.lng()}&zoom=${zoom}` + bblHashComponent
}

const zoomLevelDeltaAtWhichToUpdateStyles = 0.5
const handleZoomChanged = function (e) {
  const currentZoomLevel = map.getZoom()

  // Only update styles when the zoom has changed by more than zoomLevelDeltaAtWhichToUpdateStyles since the styles were most recently updated
  if (currentZoomLevel > zoomLevelAtWhichStylesMostRecentlyApplied + zoomLevelDeltaAtWhichToUpdateStyles || currentZoomLevel < zoomLevelAtWhichStylesMostRecentlyApplied - zoomLevelDeltaAtWhichToUpdateStyles) {
    datasetLayer.style = setOnMapPropertyStyle
  }
}

const handleClickOnMap = function (e) {
  selectedPropertyBBL = null
  const propertyDetailsDrawerHTML = ''
  document.getElementById('nav-home-tab').click()
  document.getElementById('property-details-drawer').innerHTML = propertyDetailsDrawerHTML
  updateUrlHash()
}

const departmentOfFinanceUrlTemplate = 'https://a836-pts-access.nyc.gov/care/datalets/datalet.aspx?mode=profileall2&UseSearch=no&pin='
const handlePropertyClickOnMap = function (e) {
  if (e.features) {
    const clickedPropertyAttributes = e.features[0].datasetAttributes
    console.log(clickedPropertyAttributes)

    selectedPropertyBBL = clickedPropertyAttributes.BoroughBlockLot

    const propertyDetailsAttributeNameClass = 'col-5 my-2 lh-1'
    const propertyDetailsAttributeValueClass = 'col-7 my-2 lh-1'
    const propertyDetailsDrawerHTML = `
    <dl class="row small"><dt class="${propertyDetailsAttributeNameClass}">Address</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${clickedPropertyAttributes.Address}</dd>
    
    <dt class="${propertyDetailsAttributeNameClass}">Owner</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${clickedPropertyAttributes.OwnerName}</dd>

    <dt class="${propertyDetailsAttributeNameClass}">Market Value</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${formatCurrency(clickedPropertyAttributes.CurrentMarketTotalValue)}</dd>

    <dt class="${propertyDetailsAttributeNameClass}">Annual Property Tax&nbsp;Bill</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${formatCurrency(clickedPropertyAttributes.TaxBill)}</dd>

    <dt class="${propertyDetailsAttributeNameClass}">Effective Tax Rate</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${formatPercentage(clickedPropertyAttributes.EffectiveTaxRate)} <span class="text-muted">of the property's value per year</span></dd>

    <dd class="col"><a href="${departmentOfFinanceUrlTemplate}${clickedPropertyAttributes.BoroughBlockLot}" target="_blank">View property on NYC Department of Finance website</a></dd>
      </dl>
      `

    document.getElementById('property-details-drawer').innerHTML = propertyDetailsDrawerHTML
    document.getElementById('nav-property-details-tab').click()

    updateUrlHash()
  }
}

function setOnMapPropertyStyle (params) {
  // console.log('Attempting to setOnMapPropertyStyle')

  // Get the data for this property, so we can work with all of its attributes
  const datasetFeature = params.feature

  // Determine color based on effective tax rate
  const thisPropertyColor = determineColorForEffectiveTaxRate(datasetFeature.datasetAttributes.EffectiveTaxRate)

  // Determine pointRadius based on zoom level
  const zoomLevel = map.getZoom()
  let pointRadius = 1
  if (zoomLevel <= 15.5) {
    pointRadius = 0.5
  } else if (zoomLevel <= 16) {
    pointRadius = 1
  } else if (zoomLevel <= 17) {
    pointRadius = 1.5
  } else if (zoomLevel <= 18) {
    pointRadius = 3
  } else if (zoomLevel <= 18.5) {
    pointRadius = 5
  } else if (zoomLevel <= 19) {
    pointRadius = 10
  } else {
    pointRadius = 15
  }

  // Update tracker of the zoom level at which styles were most recently applied, so that we can
  zoomLevelAtWhichStylesMostRecentlyApplied = zoomLevel

  return {
    strokeColor: thisPropertyColor,
    strokeWeight: 2,
    strokeOpacity: 1,
    fillColor: thisPropertyColor,
    fillOpacity: 0.3,
    pointRadius
  }
}

// // Constants for property color interpolation
// const color1 = '#FF0000' // Red
// const color2 = '#00FF00' // Green
// const r1 = parseInt(color1.substring(1, 3), 16)
// const g1 = parseInt(color1.substring(3, 5), 16)
// const b1 = parseInt(color1.substring(5, 7), 16)

// const r2 = parseInt(color2.substring(1, 3), 16)
// const g2 = parseInt(color2.substring(3, 5), 16)
// const b2 = parseInt(color2.substring(5, 7), 16)
// const A = 0
// const B = 5 / 100

// Interpolate the color for a property based on where value is in the domain A to B
// function interpolateColor (color1, color2, value, A, B) {
//   // const t = (value - A) / (B - A)

//   // const r = Math.round(r1 + (r2 - r1) * t)
//   // const g = Math.round(g1 + (g2 - g1) * t)
//   // const b = Math.round(b1 + (b2 - b1) * t)

//   // return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0')

// }

// Color scale from https://purple.vercel.app/#4/6/50/37/-65/108/20/14/E3A100/227/161/0
const determineColorForEffectiveTaxRate = function (effectiveTaxRate) {
  if (isNaN(effectiveTaxRate) || effectiveTaxRate <= 0) {
    return '#000000'
  }

  if (effectiveTaxRate < 0.3 / 100) {
    return '#137900'
  }

  if (effectiveTaxRate < 0.7 / 100) {
    return '#449500'
  }

  if (effectiveTaxRate < 1 / 100) {
    return '#83B000'
  }

  if (effectiveTaxRate < 1.5 / 100) {
    return '#CAC600'
  }

  if (effectiveTaxRate < 2.5 / 100) {
    return '#E3A100'
  }

  if (effectiveTaxRate < 3.5 / 100) {
    return '#E86610'
  }

  if (effectiveTaxRate < 4.5 / 100) {
    return '#ED3020'
  }

  return '#F12F4D'
}

// Create the map
initMap()

// Format a currency string without decimal places
const formatCurrency = function (value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0, // No decimal places
    maximumFractionDigits: 0 // No decimal places
  }).format(value)
}

// Format a percentage string with two deximal places
function formatPercentage (value) {
  if (isNaN(value)) {
    return '0.0%'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 2 // Two decimal places
  }).format(value)
}
