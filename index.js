let map

const mapId = '33d6428f2a3923ea'
const datasetId = 'a8b90d7d-32b5-4caf-baa6-82afda6b280a'

const boundsOfNYC = {
  north: 41.20,
  south: 40.40309,
  west: -74.47253,
  east: -73.56091
}
const AUCKLAND = { lat: -37.06, lng: 174.58 }

// function initMap() {
//   map = new google.maps.Map(document.getElementById("map"), {
//     center: AUCKLAND,
//     restriction: {
//       latLngBounds: boundsOfNYC,
//       strictBounds: false,
//     },
//     zoom: 7,
//   });
// }

async function initMap () {
  const { Map } = await google.maps.importLibrary('maps')

  // Create the map
  map = new Map(document.getElementById('map'), {
    center: { lat: 40.76325558726835, lng: -73.96569786865471 },
    zoom: 19,
    minZoom: 13,
    restriction: {
      latLngBounds: boundsOfNYC,
      strictBounds: false
    },
    mapId
  })

  const datasetLayer = map.getDatasetFeatureLayer(datasetId)

  datasetLayer.style = setStyle // styleOptions

  function handleClick (/* MouseEvent */ e) {
    console.log(e)
    if (e.features) {
      const clickedPropertyAttributes = e.features[0].datasetAttributes
      console.log(clickedPropertyAttributes)
    }
  }
  datasetLayer.addListener('click', handleClick)
}

// const styleOptions = {
//   strokeColor: 'green',
//   strokeWeight: 2,
//   strokeOpacity: 1,
//   fillColor: 'green',
//   fillOpacity: 0.3,
//   pointRadius: 1
// }

function setStyle (params) {
  // Get the dataset feature, so we can work with all of its attributes.
  const datasetFeature = params.feature

  // Perform interpolation of the color based on the property's effective tax rate
  const thisPropertyColor = interpolateColor(color1, color2, datasetFeature.datasetAttributes.EffectiveTaxRate, A, B)
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

// Constants for property color interpolation
const color1 = '#FF0000' // Red
const color2 = '#00FF00' // Green
const r1 = parseInt(color1.substring(1, 3), 16)
const g1 = parseInt(color1.substring(3, 5), 16)
const b1 = parseInt(color1.substring(5, 7), 16)

const r2 = parseInt(color2.substring(1, 3), 16)
const g2 = parseInt(color2.substring(3, 5), 16)
const b2 = parseInt(color2.substring(5, 7), 16)
const A = 0
const B = 5 / 100

// Interpolate the color for a property based on where value is in the domain A to B
function interpolateColor (color1, color2, value, A, B) {
  const t = (value - A) / (B - A)

  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)

  return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0')
}

// Create the map
initMap()
