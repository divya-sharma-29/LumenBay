# Architecture Diagram

Lumen Bay is a static, browser-based city simulator. Its interface, simulation modules, city visualization, and city data are delivered as local assets; no database or external API is required.

## Application Architecture

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
~~~mermaid
flowchart TD
    subgraph Client["Browser Client"]
        Page["HTML and CSS interface"]
        App["Simulation controller"]
        Scene["Three.js city renderer"]
    end
    subgraph Logic["Simulation Logic"]
        Transport["Transport model"]
        Economy["Economy and utility model"]
        Policy["Events and policy analysis"]
    end
    subgraph Data["Application Data"]
        CityData["Built-in city configuration"]
        BrowserStore[("Browser local storage")]
    end
    subgraph Hosting["Static Hosting"]
        Host["Node development server or static host"]
    end

    Host -->|"serves application assets"| Page
    Page -->|"starts and displays"| App
    App -->|"runs travel assignment"| Transport
    App -->|"calculates city outcomes"| Economy
    Economy -->|"uses travel results"| Transport
    App -->|"evaluates events and responses"| Policy
    CityData -->|"configures simulation"| App
    App -->|"saves custom cities and experiments"| BrowserStore
    App -->|"updates and exports city geometry"| Scene
~~~

### Technology Stack Summary

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Presentation | HTML, CSS, browser JavaScript | Browser-native | Simulator controls, charts, reports, and tabs |
| 3D visualization | Three.js | 0.180.0 | Procedural city rendering, orbit controls, and GLB export |
| Simulation | Plain JavaScript modules | Browser-native | Transport, economy, events, services, and policy analysis |
| Local development | Node.js HTTP server | Not pinned | Serves the static application from `src` |
| Persistence | Browser local storage | Browser-native | Stores user-loaded cities and saved experiments |
| Automated checks | Node.js test scripts | Not pinned | Exercises simulation, city files, and page behavior |

### Data Storage & External Services

The simulator has no server database, cache, message broker, or external API dependency. Built-in city configuration ships with the application, while user-loaded cities and saved experiments are kept in browser local storage. The development server only serves static assets; production can use any compatible static host.

### Key Architectural Decisions

- The simulation runs locally in the browser, keeping scenario updates and reports independent of a backend service.
- The 3D city is generated from named, separate Three.js objects and can be exported as a GLB model.
- The transport model feeds downstream economy and policy calculations, keeping those outcomes derived from the same scenario.

## Component Relationships

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
~~~mermaid
flowchart LR
    subgraph cPresentation["Presentation"]
        cPage["index.html"]
        cApp["app.js"]
        cCityUi["city-ui.js"]
        cScene["city-3d.js"]
    end
    subgraph cBusiness["Simulation Logic"]
        cSim["sim.js"]
        cEconomy["economy.js"]
        cEvents["events.js"]
        cServices["services.js"]
        cResponses["responses.js"]
        cLedger["ledger.js"]
        cUncertainty["uncertainty.js"]
    end
    subgraph cData["Data and Persistence"]
        cDataFile["city-data.js"]
        cFile["cityfile.js"]
        cStore["city storage"]
    end
    subgraph cInfrastructure["Infrastructure"]
        cThree["Three.js and add-ons"]
        cServer["scripts/serve.js"]
    end

    cPage -->|"loads interface and modules"| cApp
    cPage -->|"loads visual module"| cScene
    cApp -->|"runs transport scenarios"| cSim
    cApp -->|"calculates outcomes"| cEconomy
    cEconomy -->|"uses travel assignment"| cSim
    cApp -->|"builds and updates events"| cEvents
    cApp -->|"calculates service access"| cServices
    cApp -->|"compares policy responses"| cResponses
    cApp -->|"renders impact accounting"| cLedger
    cApp -->|"runs scenario variations"| cUncertainty
    cDataFile -->|"supplies city configuration"| cApp
    cCityUi -->|"validates city files"| cFile
    cCityUi -->|"persists city choices"| cStore
    cApp -->|"renders and exports city"| cScene
    cScene -->|"uses rendering and GLB tools"| cThree
    cServer -->|"serves static files locally"| cPage
~~~

### Component Inventory

| Component | Layer | Type | Responsibility |
|---|---|---|---|
| `index.html` | Presentation | Browser entry point | Defines simulator layout and loads scripts and modules |
| `app.js` | Presentation | UI controller | Connects controls, scenario state, calculations, and page rendering |
| `city-ui.js` | Presentation | City file UI | Handles loading, validation feedback, and selection of city files |
| `city-3d.js` | Presentation | 3D scene module | Builds named city geometry, handles picking, and exports GLB |
| `sim.js` | Simulation Logic | Transport model | Assigns resident trips to roads and transit |
| `economy.js` | Simulation Logic | Outcome model | Calculates business, utility, and budget outcomes |
| `events.js` | Simulation Logic | Scenario module | Applies disruptions and scenario parameters |
| `services.js` | Simulation Logic | Service model | Calculates access to public facilities |
| `responses.js` | Simulation Logic | Policy analysis | Evaluates candidate response packages |
| `ledger.js` | Simulation Logic | Impact accounting | Summarizes policy effects across resident groups |
| `uncertainty.js` | Simulation Logic | Scenario analysis | Runs variations across simulated cities |
| `city-data.js` | Data | Configuration module | Provides the built-in city configuration |
| `cityfile.js` | Data | Validation module | Parses and validates imported city files |
| `city storage` | Data and Persistence | Browser storage | Keeps custom city data and experiments in local storage |
| `Three.js and add-ons` | Infrastructure | Rendering library | Provides WebGL rendering, camera controls, and GLB export |
| `scripts/serve.js` | Infrastructure | Static HTTP server | Serves the application locally during development |
