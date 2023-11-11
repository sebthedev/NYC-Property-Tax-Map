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
  const { Map } = await window.google.maps.importLibrary('maps')

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

  // Attach the map legend
  const legend = document.getElementById('legend')
  map.controls[window.google.maps.ControlPosition.BOTTOM_CENTER].push(legend)

  document.getElementById('legend').classList.add('animate-fade-in')

  // Initialize the current zoom level
  currentZoomLevel = map.getZoom()
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

// When the zoom level changes significantly, re-compute the property styles so that we can resize the property bubbles to be larger at deeper zoom levels
const zoomLevelDeltaAtWhichToUpdateStyles = 0.5
let currentZoomLevel = null
const handleZoomChanged = function (e) {
  currentZoomLevel = map.getZoom()

  // Only update styles when the zoom has changed by more than zoomLevelDeltaAtWhichToUpdateStyles since the styles were most recently updated
  if (currentZoomLevel > zoomLevelAtWhichStylesMostRecentlyApplied + zoomLevelDeltaAtWhichToUpdateStyles || currentZoomLevel < zoomLevelAtWhichStylesMostRecentlyApplied - zoomLevelDeltaAtWhichToUpdateStyles) {
    // Update the tracker of the zoom level at which the styles were most recently updated
    zoomLevelAtWhichStylesMostRecentlyApplied = currentZoomLevel
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
const taxClassDescriptions = {
  1: 'Residential with up to three units',
  2: 'Residential with four or more units',
  3: 'Utilities',
  4: 'Commercial or industrial'
}
const handlePropertyClickOnMap = function (e) {
  if (e.features) {
    const clickedPropertyAttributes = e.features[0].datasetAttributes
    console.log(clickedPropertyAttributes)

    selectedPropertyBBL = clickedPropertyAttributes.BoroughBlockLot

    const propertyDetailsAttributeNameClass = 'col-5 my-1 my-md-2 lh-1'
    const propertyDetailsAttributeValueClass = 'col-7 my-1 my-md-2 lh-1'
    const propertyDetailsDrawerHTML = `
    <dl class="row small"><dt class="${propertyDetailsAttributeNameClass}">Address</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${clickedPropertyAttributes.Address}</dd>
    
    <dt class="${propertyDetailsAttributeNameClass}">Owner</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${clickedPropertyAttributes.OwnerName}</dd>

    <dt class="${propertyDetailsAttributeNameClass}">Tax Class</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${taxClassDescriptions[clickedPropertyAttributes.TaxClass]} <span class="text-muted">(Class&nbsp;${clickedPropertyAttributes.TaxClass})</span></dd>
  
    <dt class="${propertyDetailsAttributeNameClass}">Market Value</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${formatCurrency(clickedPropertyAttributes.CurrentMarketTotalValue)}</dd>

    <dt class="${propertyDetailsAttributeNameClass}">Property Tax&nbsp;Bill</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${formatCurrency(clickedPropertyAttributes.TaxBill)} <span class="text-muted">per year</span></dd>

    <dt class="${propertyDetailsAttributeNameClass}">Effective Tax Rate</dt>
    <dd class="${propertyDetailsAttributeValueClass}"><span style="color: ${determineColorForEffectiveTaxRate(clickedPropertyAttributes.EffectiveTaxRate)};">${formatPercentage(clickedPropertyAttributes.EffectiveTaxRate)}</span> <span class="text-muted">of the property's value per year</span></dd>

    <dd class="col"><a href="${departmentOfFinanceUrlTemplate}${clickedPropertyAttributes.BoroughBlockLot}" target="_blank">View property on NYC Department of Finance website</a></dd>
      </dl>
      `

    document.getElementById('property-details-drawer').innerHTML = propertyDetailsDrawerHTML
    document.getElementById('nav-property-details-tab').click()

    updateUrlHash()
  }
}

const isTouchscreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0
function setOnMapPropertyStyle (params) {
  // Determine the right color for this property, based on its effective tax rate
  const thisPropertyColor = determineColorForEffectiveTaxRate(params.feature.datasetAttributes.EffectiveTaxRate)

  // Determine pointRadius based on zoom level
  // const zoomLevel = map.getZoom()
  let pointRadius = 1
  if (currentZoomLevel <= 15.5) {
    pointRadius = 0.5
  } else if (currentZoomLevel <= 16) {
    pointRadius = 1
  } else if (currentZoomLevel <= 17) {
    pointRadius = 1.5
  } else if (currentZoomLevel <= 18) {
    pointRadius = 3
  } else if (currentZoomLevel <= 18.5) {
    pointRadius = 5
  } else if (currentZoomLevel <= 19) {
    pointRadius = 10
  } else {
    pointRadius = 15
  }
  // if (isTouchscreen) { pointRadius = pointRadius * 2 }

  return {
    strokeColor: thisPropertyColor,
    strokeWeight: 2,
    strokeOpacity: 1,
    fillColor: thisPropertyColor,
    fillOpacity: 0.3,
    pointRadius
  }
}

// Color scale from https://purple.vercel.app/#4/6/50/37/-65/108/20/14/E3A100/227/161/0
const effectiveTaxRateToColorMap = [
  [0, '#000000'],
  [0.003, '#137900'],
  [0.007, '#449500'],
  [0.010, '#83B000'],
  [0.015, '#CAC600'],
  [0.025, '#E3A100'],
  [0.035, '#E86610'],
  [0.045, '#ED3020'],
  [1.000, '#F12F4D']
]
const effectiveTopEndOfScale = 0.06
const determineColorForEffectiveTaxRate = function (effectiveTaxRate) {
  if (isNaN(effectiveTaxRate)) {
    return effectiveTaxRateToColorMap[0][1]
  }

  for (let index = 0; index < effectiveTaxRateToColorMap.length; index++) {
    const element = effectiveTaxRateToColorMap[index]
    if (effectiveTaxRate <= element[0]) {
      return element[1]
    }
  }

  return effectiveTaxRateToColorMap[0][1]
}

// Calculate and set a linear gradiaent representing the color scale for the map
const calculateLinearGradientForColorScale = function () {
  function createGradient (colorsMap, rangeMax) {
    const gradientStops = colorsMap.map(([position, color]) => {
      const percentage = Math.min((position / rangeMax) * 100, 100)
      return `${color} ${percentage.toFixed(2)}%`
    })

    return `linear-gradient(90deg, ${gradientStops.join(', ')})`
  }

  const cssGradient = createGradient(effectiveTaxRateToColorMap, effectiveTopEndOfScale)
  console.log(cssGradient)
  const element = document.getElementById('color-scale')
  element.style.background = cssGradient
}
calculateLinearGradientForColorScale()

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
