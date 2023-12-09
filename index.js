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
    lat: 40.7484,
    lng: -73.9857,
    zoom: 16,
    selectedPropertyBBL: null
  }

  const hash = window.location.hash
  if (hash.startsWith('#!')) {
    const params = {}
    const regExp = /[\#|&]([^=]+)=([^&]+)/g
    let match

    while ((match = regExp.exec(hash)) !== null) {
      if (match[1].charAt(0) === '!') {
        match[1] = match[1].substring(1)
      }
      params[match[1]] = parseFloat(match[2])
    }

    return {
      lat: params.lat || defaults.lat,
      lng: params.lng || defaults.lng,
      zoom: params.zoom || defaults.zoom,
      selectedPropertyBBL: params.bbl || defaults.selectedPropertyBBL
    }
  }

  return defaults
}

async function initMap () {
  const { Map } = await window.google.maps.importLibrary('maps')

  const mapParameters = getMapParametersFromHash()

  selectedPropertyBBL = mapParameters.selectedPropertyBBL
  console.log('init parameters', mapParameters)

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
  applyStylesToMap()

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
  const zoom = map.getZoom().toFixed(2)

  let bblHashComponent = ''
  if (selectedPropertyBBL !== null) {
    bblHashComponent = `&bbl=${selectedPropertyBBL}`
  }
  // Update the URL hash with the new center
  window.location.hash = `#!lat=${center.lat().toFixed(5)}&lng=${center.lng().toFixed(5)}&zoom=${zoom}` + bblHashComponent
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
    applyStylesToMap()
  }
}

const applyStylesToMap = function () {
  datasetLayer.style = setOnMapPropertyStyle
}

// Handle the deselection of a place
const handleClickOnMap = function (e) {
  selectedPropertyBBL = null
  applyStylesToMap()
  const propertyDetailsDrawerHTML = ''
  document.getElementById('nav-home-tab').click()
  document.getElementById('property-details-drawer').innerHTML = propertyDetailsDrawerHTML
  updateUrlHash()
  document.getElementById('addressSearchBox').blur()
}

const populatePropertyDetailsPaneContent = function (selectedPropertyDetails) {
  const effectiveTaxRatePercentileWithinClass = findTaxRatePercentile(selectedPropertyDetails.TaxClass, selectedPropertyDetails.EffectiveTaxRate, effectiveTaxRateQuantiles)

  const propertyDetailsDrawerHTML = `
  <div class="col-lg-6">
  <dl class="row small">
  <dt class="${propertyDetailsAttributeNameClass}">Address</dt>
  <dd class="${propertyDetailsAttributeValueClass}">${selectedPropertyDetails.Address}</dd>
  
  <dt class="${propertyDetailsAttributeNameClass}">Owner</dt>
  <dd class="${propertyDetailsAttributeValueClass}">${selectedPropertyDetails.OwnerName}</dd>

  <dt class="${propertyDetailsAttributeNameClass}">Tax Class</dt>
  <dd class="${propertyDetailsAttributeValueClass}">${taxClassDescriptions[selectedPropertyDetails.TaxClass]} <span class="text-muted">(Class&nbsp;${selectedPropertyDetails.TaxClass})</span></dd>

  <dt class="${propertyDetailsAttributeNameClass}">Market Value</dt>
  <dd class="${propertyDetailsAttributeValueClass}">${formatCurrency(selectedPropertyDetails.CurrentMarketTotalValue)}</dd></dl>
</div><div class="col-lg-6"><dl class="row small">
  <dt class="${propertyDetailsAttributeNameClass}">Property Tax&nbsp;Bill</dt>
  <dd class="${propertyDetailsAttributeValueClass}">${formatCurrency(selectedPropertyDetails.TaxBill)} <span class="text-muted">per year</span></dd>

  <dt class="${propertyDetailsAttributeNameClass}">Effective Tax Rate</dt>
  <dd class="${propertyDetailsAttributeValueClass}"><span style="color: ${determineColorForEffectiveTaxRate(selectedPropertyDetails.EffectiveTaxRate)};">${formatPercentage(selectedPropertyDetails.EffectiveTaxRate)}</span> <span class="text-muted">of the property's value per year</span></dd>

  <dt class="${propertyDetailsAttributeNameClass}">Tax Rate Comparison</dt>
  <dd class="${propertyDetailsAttributeValueClass}">This property's tax rate is <span style="color: ${effectiveTaxRatePercentileWithinClass.color};">${effectiveTaxRatePercentileWithinClass.comparitor} than ${Math.round(effectiveTaxRatePercentileWithinClass.comparitorPercentile)}%</span> of taxable NYC class&nbsp;${selectedPropertyDetails.TaxClass} properties</dd>

  <dd class="col">View property on: <a href="${departmentOfFinanceUrlTemplate}${selectedPropertyDetails.BoroughBlockLot}" target="_blank" title="View property on NYC Department of Finance">DOF</a>, <a href="${zolaTemplate}${[selectedPropertyDetails.BoroughBlockLot.substring(0, 1), selectedPropertyDetails.BoroughBlockLot.substring(1, 6), selectedPropertyDetails.BoroughBlockLot.substring(6)].join('/')}" title="View property on NYC's Zoning & Land Use Map">ZoLa Map</a></dd>
    </dl>
    </div>
    `

  document.getElementById('property-details-drawer').innerHTML = propertyDetailsDrawerHTML
  document.getElementById('nav-property-details-tab').click()
}

const departmentOfFinanceUrlTemplate = 'https://a836-pts-access.nyc.gov/care/datalets/datalet.aspx?mode=profileall2&UseSearch=no&pin='
const zolaTemplate = 'https://zola.planning.nyc.gov/l/lot/'
const taxClassDescriptions = {
  1: 'Residential with up to three units',
  2: 'Residential with four or more units',
  3: 'Utilities',
  4: 'Commercial or industrial'
}
const propertyDetailsAttributeNameClass = 'col-5 col-md-3 my-1 my-md-2 lh-1'
const propertyDetailsAttributeValueClass = 'col-7 col-md-9 my-1 my-md-2 lh-1'
const handlePropertyClickOnMap = function (e) {
  if (e.features) {
    const clickedPropertyAttributes = e.features[0].datasetAttributes

    selectedPropertyBBL = clickedPropertyAttributes.BoroughBlockLot

    applyStylesToMap()

    updateUrlHash()
  }
}

// const isTouchscreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0
function setOnMapPropertyStyle (params) {
  // console.log(`selectedPropertyBBL is ${selectedPropertyBBL}. This property is ${params.feature.datasetAttributes.BoroughBlockLot}`)
  const thisPropertyIsSelected = (params.feature.datasetAttributes.BoroughBlockLot === selectedPropertyBBL + '')
  // console.log(typeof selectedPropertyBBL)
  // console.log(typeof params.feature.datasetAttributes.BoroughBlockLot)
  // console.log(params.feature.datasetAttributes)

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
  let fillOpacity = 0.3

  // Perform special styling and populate property details pane if this property is selected
  if (thisPropertyIsSelected) {
  // if (params.feature.datasetAttributes === '1007390001') {
    console.log('Found selected property!')
    populatePropertyDetailsPaneContent(params.feature.datasetAttributes)
    pointRadius = pointRadius * 2
    fillOpacity = 0.8
  }

  return {
    strokeColor: thisPropertyColor,
    strokeWeight: 2,
    strokeOpacity: 1,
    fillColor: thisPropertyColor,
    fillOpacity,
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

const effectiveTaxRateQuantiles = [{
  TaxClass: '1',
  EffectiveTaxRatePercentiles: ['2e-08', '0.00138333', '0.00184305', '0.0021257', '0.00235697', '0.00254749', '0.00273613', '0.00291592', '0.00308837', '0.00324847', '0.00342775', '0.00359704', '0.00378198', '0.00395863', '0.00414968', '0.00434414', '0.00452924', '0.00470591', '0.00488228', '0.00504664', '0.00519877', '0.00535087', '0.00548319', '0.00561207', '0.00573121', '0.00584332', '0.00595229', '0.00604547', '0.00614035', '0.00622529', '0.00631132', '0.00639156', '0.00646836', '0.00654069', '0.00661323', '0.00668065', '0.0067463', '0.00680929', '0.00687158', '0.00693246', '0.00699005', '0.00704675', '0.0071033', '0.00715825', '0.00720829', '0.00726341', '0.00731245', '0.00736385', '0.00741583', '0.00746577', '0.00751299', '0.00756261', '0.00761106', '0.00766011', '0.00770772', '0.00775589', '0.00780128', '0.00784775', '0.00789433', '0.00794279', '0.00798637', '0.0080334', '0.00807909', '0.00812679', '0.0081747', '0.00822129', '0.00826887', '0.0083151', '0.00836243', '0.00841525', '0.00846261', '0.00851372', '0.00856309', '0.00861359', '0.0086636', '0.0087177', '0.00877205', '0.00882852', '0.00888507', '0.00894602', '0.00900668', '0.00906797', '0.00913239', '0.00919789', '0.00926594', '0.00933816', '0.00941295', '0.00949085', '0.00957376', '0.00966397', '0.00976147', '0.00986932', '0.00998453', '0.01011264', '0.01025793', '0.01043208', '0.01061794', '0.01086666', '0.01126248', '0.01194501', '0.01910029']
}, {
  TaxClass: '2',
  EffectiveTaxRatePercentiles: ['2e-08', '0.00036655', '0.00111448', '0.00199877', '0.00291851', '0.00383745', '0.00458391', '0.00518532', '0.00575024', '0.00623384', '0.00668227', '0.0071111', '0.00753794', '0.00793266', '0.00834377', '0.00873793', '0.00917241', '0.00962425', '0.0100763', '0.01052399', '0.01097354', '0.01139557', '0.011852', '0.01231705', '0.01277505', '0.0132571', '0.01373064', '0.01417081', '0.01459538', '0.01505802', '0.01551336', '0.01594749', '0.01636658', '0.01675762', '0.01717235', '0.0175789', '0.01798287', '0.01838131', '0.01880798', '0.01920181', '0.01960195', '0.01996274', '0.02024362', '0.02065136', '0.02105791', '0.02149899', '0.02190859', '0.02233084', '0.02275524', '0.0232323', '0.0236871', '0.02422911', '0.02479859', '0.02540618', '0.0260342', '0.02664137', '0.02735747', '0.02817449', '0.02859605', '0.02961561', '0.0307974', '0.03192778', '0.03299376', '0.03419789', '0.03555184', '0.03684403', '0.03819776', '0.03940191', '0.04071769', '0.04184728', '0.0428881', '0.04380644', '0.04465432', '0.0454092', '0.04611842', '0.04678923', '0.0474489', '0.04804757', '0.0486823', '0.04932764', '0.04981792', '0.05039171', '0.05097261', '0.05152717', '0.05205821', '0.05259107', '0.05309245', '0.0536354', '0.05415089', '0.05465902', '0.05517866', '0.055215', '0.055215', '0.055215', '0.055215', '0.055215', '0.055215', '0.055215', '0.055215', '0.055215', '0.05521584']
}, {
  TaxClass: '3',
  EffectiveTaxRatePercentiles: ['0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011']
}, {
  TaxClass: '4',
  EffectiveTaxRatePercentiles: ['1e-08', '0.00484925', '0.00920487', '0.01270785', '0.01659504', '0.02073678', '0.02481503', '0.02880022', '0.03144592', '0.03324006', '0.03377071', '0.03380114', '0.03408295', '0.03491499', '0.0357925', '0.03657987', '0.03734738', '0.03803863', '0.0386581', '0.03915041', '0.03960594', '0.04008727', '0.04044635', '0.04080438', '0.04112864', '0.04142438', '0.04166847', '0.04192672', '0.04216059', '0.04236413', '0.04256026', '0.04270885', '0.04287026', '0.04304121', '0.04317508', '0.04328435', '0.04344336', '0.04360847', '0.04377869', '0.04394299', '0.04410607', '0.04425415', '0.04442703', '0.04457786', '0.04472693', '0.04486712', '0.04499328', '0.04507268', '0.04518596', '0.04531214', '0.04544724', '0.04557867', '0.04570822', '0.04584516', '0.04597657', '0.04609416', '0.04622584', '0.04636361', '0.04649306', '0.04664129', '0.04678255', '0.04690426', '0.04698613', '0.04703393', '0.04704767', '0.04708631', '0.04720179', '0.04735198', '0.04750368', '0.04765875', '0.04781766', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.0550906']
}]

function findTaxRatePercentile (taxClass, effectiveTaxRate, effectiveTaxRateQuantiles) {
  // Find the tax class entry
  const taxClassEntry = effectiveTaxRateQuantiles.find(entry => entry.TaxClass === taxClass)

  if (!taxClassEntry) {
    return 'Tax class not found'
  }

  // Convert percentile strings to floats
  const percentiles = taxClassEntry.EffectiveTaxRatePercentiles.map(rate => parseFloat(rate))

  // Find the position of the effective tax rate in the percentiles array
  let position = percentiles.findIndex(rate => effectiveTaxRate <= rate)

  // Adjust position if it's not found (meaning it's higher than the last percentile)
  if (position === -1) {
    position = percentiles.length
  }

  // Calculate and return the percentile
  const percentile = position / percentiles.length * 100

  if (percentile < 50) {
    return {
      percentile,
      comparitor: 'lower',
      comparitorPercentile: 100 - percentile,
      color: '#137900'
    }
  } else {
    return {
      percentile,
      comparitor: 'higher',
      comparitorPercentile: percentile,
      color: '#F12F4D'
    }
  }
}

// Autocomplete

const enableInputAutocomplete = function (autocompleteInputElement, arr) {
  // Start searching when a user inputs into the autocomplete search box
  autocompleteInputElement.addEventListener('input', function (e) {
    const queryText = autocompleteInputElement.value

    // Close any already open lists of autocompleted values
    closeAutocompleteLists()

    // Bail if the query string is absent
    if (!queryText) {
      return false
    }

    fetchLocationsForAddressQuery(queryText)
  })

  const geoSearchAutoCompleteURLBase = 'https://geosearch.planninglabs.nyc/v2/autocomplete'
  const fetchLocationsForAddressQuery = function (addressQuery) {
    // Bail if the query is too short to return meaningful results
    if (addressQuery.trim().length < 3) {
      return
    }

    // Initialize the base URL
    const geoSearchAutoCompleteURL = new URL(geoSearchAutoCompleteURLBase)

    // Add the address query parameter
    const params = new URLSearchParams()
    params.append('text', addressQuery)

    // Attempt to give the GeoSearch query a focus of the current map center
    try {
      const currentMapCenter = map.getCenter()

      params.append('focus.point.lat', currentMapCenter.lat())
      params.append('focus.point.lon', currentMapCenter.lng())
    } catch (error) {
      // Fail silently
    }

    // Append the query parameters to the URL
    geoSearchAutoCompleteURL.search = params.toString()

    // Request the autocompletion from the GeoSearch API
    fetch(geoSearchAutoCompleteURL.href)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        return response.json()
      })
      .then(data => {
        const dataQuery = data.geocoding.query.text
        const autocompleteInputElementValue = autocompleteInputElement.value

        // Bail if the query in this data response doesn't match the current text in the search box
        if (dataQuery.trim() !== autocompleteInputElementValue.trim()) {
          return
        }

        /* create a DIV element that will contain the items (values): */
        const autocompleteListDiv = document.createElement('DIV')
        autocompleteListDiv.setAttribute('id', 'autocomplete-list')
        autocompleteListDiv.setAttribute('class', 'autocomplete-items')
        /* append the DIV element as a child of the autocomplete container: */
        autocompleteInputElement.parentNode.appendChild(autocompleteListDiv)

        // Create the HTML div elements for each search result
        data.features.forEach(function (item) {
          const autocompleteListItemDiv = document.createElement('DIV')
          const visiblePlaceLabel = [item.properties.name, item.properties.neighbourhood, item.properties.borough].join(', ')

          autocompleteListItemDiv.innerHTML = visiblePlaceLabel

          // Take action when this autocomplete item is clicked
          autocompleteListItemDiv.addEventListener('click', function (e) {
            autocompleteInputElement.value = '' // visiblePlaceLabel

            selectedPropertyBBL = item.properties.addendum.pad.bbl

            // Create a LatLng object for the new center
            const newCenter = new window.google.maps.LatLng(item.geometry.coordinates[1], item.geometry.coordinates[0])

            // Set the new center and zoom level simultaneously
            map.setOptions({
              center: newCenter,
              zoom: 17
            })

            closeAutocompleteLists()
          })
          autocompleteListDiv.appendChild(autocompleteListItemDiv)
        })
      })
      .catch(error => {
        console.error('There has been a problem with your fetch operation:', error)
      })
  }

  function closeAutocompleteLists (elmnt) {
    /* close all autocomplete lists in the document,
    except the one passed as an argument: */
    const x = document.getElementsByClassName('autocomplete-items')
    for (let i = 0; i < x.length; i++) {
      if (elmnt !== x[i] && elmnt !== autocompleteInputElement) {
        x[i].parentNode.removeChild(x[i])
      }
    }
  }
  /* execute a function when someone clicks in the document: */
  document.addEventListener('click', function (e) {
    closeAutocompleteLists(e.target)
  })
}

// Initialize the GeoSearch autocomplete box
const addressSearchBox = document.getElementById('addressSearchBox')
const tabContent = document.getElementById('nav-tabContent')
enableInputAutocomplete(addressSearchBox)

// Add event listeners for autocomplete focus and blur to make things work on mobile
addressSearchBox.addEventListener('focus', function () {
  tabContent.classList.add('d-none')

  setTimeout(function () {
    window.scrollTo(0, 0)
  }, 100)
})
addressSearchBox.addEventListener('blur', function () {
  setTimeout(function () {
    tabContent.classList.remove('d-none')
  }, 500)
})
