let map

const datasetId = 'a8b90d7d-32b5-4caf-baa6-82afda6b280a'
const mapId = '33d6428f2a3923ea'

async function initMap () {
  const { Map } = await google.maps.importLibrary('maps')

  map = new Map(document.getElementById('map'), {
    center: { lat: 40.76325558726835, lng: -73.96569786865471 },
    zoom: 19,
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

function setStyle (/* FeatureStyleFunctionOptions */ params) {
  // Get the dataset feature, so we can work with all of its attributes.
  const datasetFeature = params.feature

  console.log(datasetFeature.datasetAttributes)

  const thisPorpertyColor = lerpColor(color1, color2, datasetFeature.datasetAttributes.EffectiveTaxRate, A, B)
  console.log(datasetFeature.datasetAttributes.EffectiveTaxRate, thisPorpertyColor)

  return {
    strokeColor: thisPorpertyColor,
    strokeWeight: 2,
    strokeOpacity: 1,
    fillColor: thisPorpertyColor,
    fillOpacity: 0.3,
    pointRadius: 1
  }
}

function lerpColor (color1, color2, value, A, B) {
  const t = (value - A) / (B - A)

  const r1 = parseInt(color1.substring(1, 3), 16)
  const g1 = parseInt(color1.substring(3, 5), 16)
  const b1 = parseInt(color1.substring(5, 7), 16)

  const r2 = parseInt(color2.substring(1, 3), 16)
  const g2 = parseInt(color2.substring(3, 5), 16)
  const b2 = parseInt(color2.substring(5, 7), 16)

  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)

  return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0')
}

// Usage
const color1 = '#FF0000' // Red
const color2 = '#00FF00' // Green
const A = 0
const B = 5 / 100

initMap()
