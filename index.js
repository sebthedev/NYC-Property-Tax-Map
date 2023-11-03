let map

const mapId = '33d6428f2a3923ea'
const datasetId = 'a8b90d7d-32b5-4caf-baa6-82afda6b280a'

const boundsOfNYC = {
  north: 41.20,
  south: 40.40309,
  west: -74.47253,
  east: -73.56091
}

let selectedPropertyBBL = null

// Determine the map's starting position and zoom level from the URL's hash, or fallback to a default location and zoom level
function getMapParametersFromHash () {
  const defaults = {
    lat: 40.76882764497733,
    lng: -73.96813178859476,
    zoom: 13,
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
    streetViewControl: false
  })

  // Attach the property tax dataset to the map
  const datasetLayer = map.getDatasetFeatureLayer(datasetId)

  // Determine the style of each point in the dataset using the setOnMapPropertyStyle function
  datasetLayer.style = setOnMapPropertyStyle

  // Register the function to update the pane showing property details upon clicking on a property on the map
  datasetLayer.addListener('click', handlePropertyClickOnMap)

  map.addListener('click', handleClickOnMap)

  // Reggister the function to update the URL hash upon adjusting the map position or zoom
  map.addListener('idle', updateUrlHash)
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

const handleClickOnMap = function (e) {
  selectedPropertyBBL = null
  const propertyDetailsDrawerHTML = ''
  document.getElementById('property-details-drawer').innerHTML = propertyDetailsDrawerHTML
  updateUrlHash()
}

const handlePropertyClickOnMap = function (e) {
  if (e.features) {
    const clickedPropertyAttributes = e.features[0].datasetAttributes
    console.log(clickedPropertyAttributes)

    selectedPropertyBBL = clickedPropertyAttributes.BoroughBlockLot

    const propertyDetailsDrawerHTML = `<h2>${clickedPropertyAttributes.Address}</h2>
      <p>Owner: ${clickedPropertyAttributes.OwnerName}</p>
      <p>Market Value: ${formatCurrency(clickedPropertyAttributes.CurrentMarketTotalValue)}</p>
      <p>Annual Property Tax Bill: ${formatCurrency(clickedPropertyAttributes.TaxBill)}</p>
      <p>Effective Tax Rate: ${formatPercentage(clickedPropertyAttributes.EffectiveTaxRate)}</p>
      `

    document.getElementById('property-details-drawer').innerHTML = propertyDetailsDrawerHTML

    updateUrlHash()
  }
}

function setOnMapPropertyStyle (params) {
  // console.log('Attempting to setOnMapPropertyStyle')
  // Get the dataset feature, so we can work with all of its attributes.
  const datasetFeature = params.feature

  // Perform interpolation of the color based on the property's effective tax rate
  // const thisPropertyColor = interpolateColor(color1, color2, datasetFeature.datasetAttributes.EffectiveTaxRate, A, B)
  const thisPropertyColor = determineColorForEffectiveTaxRate(datasetFeature.datasetAttributes.EffectiveTaxRate)
  // console.log(datasetFeature.datasetAttributes.EffectiveTaxRate, thisPropertyColor)

  return {
    strokeColor: thisPropertyColor,
    strokeWeight: 2,
    strokeOpacity: 1,
    fillColor: thisPropertyColor,
    fillOpacity: 0.3,
    pointRadius: 1
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

const determineColorForEffectiveTaxRate = function (effectiveTaxRate) {
  if (isNaN(effectiveTaxRate) || effectiveTaxRate <= 0) {
    return '#000000'
  } else if (effectiveTaxRate < 1 / 100) {
    return '#00FF00'
  } else if (effectiveTaxRate < 2 / 100) {
    return '#0000FF'
  } else {
    return '#FF0000'
  }
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
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 2 // Two decimal places
  }).format(value)
}
