# 🌆 LumenBay — Interactive Urban Digital Twin & City Simulator

**Simulate a city. Challenge decisions. Discover consequences. Build a better future.**

LumenBay is an interactive digital twin of a fictional city designed to demonstrate how urban systems work together. It allows users to introduce policy changes, modify infrastructure, simulate unexpected events and observe how decisions affect transportation, residents, businesses, public utilities and municipal finances.

Unlike conventional city dashboards that display isolated statistics, LumenBay models the relationships between urban systems. A seemingly small change, such as reducing bus frequency or closing a flooded road, can trigger a chain of consequences throughout the city.

**One decision. Multiple consequences. An entire city transformed.**

---

## 📌 Project Overview

Modern cities are complex ecosystems. Transportation, infrastructure, public services, businesses, environmental conditions and government finances are deeply interconnected.

A disruption in one system rarely remains isolated.

LumenBay addresses this challenge through an interactive simulation environment where users can experiment with urban policies, evaluate alternative decisions and understand their short-term and long-term consequences.

The platform is designed for:
- Urban planners and municipal authorities.
- Transportation and infrastructure agencies.
- Emergency management teams.
- Researchers and academic institutions.
- Students exploring smart cities and sustainable urban development.

## 💡 The Core Concept

**Urban systems are interconnected, not independent.**

Consider what happens when a city reduces its bus frequency:

```text
Reduced Bus Frequency
        |
        v
Residents Shift Towards Private Vehicles
        |
        v
Increased Road Traffic
        |
        v
Longer Commute Times
        |
        +----------------------+
        |                      |
        v                      v
Employee Lateness       Reduced Shop Visits
        |                      |
        v                      v
Lower Productivity      Reduced Business Revenue
        |                      |
        +-----------+----------+
                    |
                    v
             Lower Tax Revenue
                    |
                    v
          Reduced Municipal Budget
                    |
                    v
          Reduced Public Services
                    |
                    v
          Further Urban Challenges
```

LumenBay makes these relationships observable through interactive scenarios, simulation results and comparative impact analysis.

## ✨ Key Features

### 1. Interactive 3D City Environment

Explore the fictional city through an immersive 3D visualization.

- Explore individually modelled buildings and city infrastructure.
- View roads, bridges, residential areas and commercial districts.
- Discover parks, trees, landmarks and public facilities.
- Navigate the environment using interactive camera controls.
- Visualize infrastructure conditions and scenario-related changes.
- Understand the geographical relationships between different city components.

The 3D environment serves as the visual foundation for understanding how simulated events affect the city.

### 2. Dynamic Urban Simulation

Experiment with different urban conditions and observe their consequences.

- Modify public transportation frequency.
- Introduce road closures and infrastructure disruptions.
- Simulate floods, heatwaves and strikes.
- Explore different combinations of simultaneous events.
- Observe changes in traffic, accessibility and city performance.
- Compare simulated outcomes against the original baseline.

### 3. Transportation and Mobility Analysis

Understand how transportation decisions influence the movement of residents.

- Public transportation and private vehicle usage.
- Traffic congestion and road capacity.
- Commuting time and accessibility.
- Road closures and alternative routes.
- Changes in transportation demand.
- Impact of transportation policies on different districts.

### 4. Economic and Business Impact

Explore how urban disruptions influence economic activity.

- Employee productivity and workplace accessibility.
- Business revenue and shopping activity.
- Changes in commercial activity across districts.
- Tax revenue and municipal income.
- Additional infrastructure and emergency expenditure.

The economic model connects transportation conditions with business activity and municipal finances.

### 5. Utilities and Infrastructure Monitoring

Understand the relationship between public utilities and urban performance.

- Electricity demand and supply.
- Water demand and availability.
- Power shortages and potential blackouts.
- Water rationing during infrastructure disruptions.
- Effects of electricity shortages on traffic infrastructure.

### 6. Emergency Scenario Simulation

Explore how a city responds to unexpected events.

Available scenario categories include:

- Flooding and infrastructure damage.
- Heatwaves and increased utility demand.
- Transportation strikes.
- Road and bridge closures.
- Public transportation disruptions.

Observe how disruptions propagate across interconnected city systems.

### 7. Policy Impact Analysis

Understand who benefits and who experiences negative consequences from a policy decision.

The analysis considers:
- Residents and different demographic groups.
- District-level differences.
- Income and vehicle ownership.
- Accessibility to essential services.
- Changes in public expenditure.
- Distribution of benefits and disadvantages.

### 8. Compare Alternative Responses

Evaluate different intervention strategies before applying them.

- Compare individual interventions.
- Evaluate combinations of affordable responses.
- Examine their expected costs and benefits.
- Identify the most effective response under a budget constraint.
- Compare proposed solutions against doing nothing.

### 9. Sensitivity and Scenario Analysis

Explore how assumptions influence simulation outcomes.

- Test alternative model assumptions.
- Compare different scenario configurations.
- Examine uncertainty across simulated city populations.
- Understand the stability of recommended interventions.
- Identify situations where the model's conclusions may change.

### 10. Reports and Decision Support

Turn simulation results into meaningful insights.

- Generate scenario-based reports.
- Review important performance indicators.
- Understand the causes behind observed changes.
- Compare alternative policy decisions.
- Preserve experiments for further evaluation.

---

## 🏙️ How LumenBay Works

The platform follows a simulation-driven workflow:

**Step 1 — Explore the City**

Understand the city's infrastructure, districts, transportation networks and public facilities.

**Step 2 — Introduce a Scenario**

Change transportation policies, introduce infrastructure disruptions or simulate an unexpected event.

**Step 3 — Run the Simulation**

The backend processes the scenario and evaluates its effects across interconnected urban systems.

**Step 4 — Analyze the Impact**

Review changes in mobility, accessibility, business activity, utilities and municipal finances.

**Step 5 — Compare Responses**

Evaluate different interventions and identify strategies that can reduce negative consequences.

**Step 6 — Make Informed Decisions**

Use the simulation results to understand trade-offs and explore more sustainable urban policies.

---

## 🛠️ Technology Stack

LumenBay uses a modern web development architecture combining frontend visualization, backend simulation and data-driven analysis.

| Layer | Technology |
|---|---|
| Frontend | React.js |
| Programming | JavaScript / TypeScript |
| Styling | CSS |
| Build Tool | Vite |
| Backend | Python |
| Backend Framework | FastAPI |
| API Architecture | REST APIs |
| 3D Visualization | Three.js / React Three Fiber |
| Database / Data Layer | Project-configured storage and simulation data |
| Version Control | Git and GitHub |
| Deployment | Render |

## 🏗️ System Architecture

LumenBay follows a frontend-backend architecture.

```text
             USER
               |
               v
       REACT FRONTEND
               |
       +-------+--------+
       |                |
       v                v
   3D CITY MAP     USER CONTROLS
       |                |
       +-------+--------+
               |
               v
          REST APIs
               |
               v
        FASTAPI BACKEND
               |
       +-------+---------+
       |       |         |
       v       v         v
   Simulation Economy Emergency
      Engine   Analysis  Engine
       |       |         |
       +-------+---------+
               |
               v
        IMPACT ANALYSIS
               |
               v
       RESULTS & REPORTS
               |
               v
        REACT FRONTEND
```

The backend contains dedicated API modules for city management, simulation, scenarios, emergency operations, impact analysis, reports and sensitivity analysis.

## 📂 Project Structure

The following is a conceptual structure; adjust filenames to match the actual repository.

```text
LumenBay/
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── assets/
│   │   ├── services/
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── endpoints/
│   │   ├── models/
│   │   └── services/
│   ├── requirements.txt
│   └── ...
│
├── docs/
│
├── README.md
└── .gitignore
```

## 🚀 Getting Started

Follow these steps to run LumenBay locally.

### Prerequisites

Make sure you have installed:

- Python 3.10 or later (use the version specified by your dependencies).
- Node.js and npm.
- Git.
- A modern web browser.

### 1. Clone the Repository

```bash
git clone https://github.com/divya-sharma-29/LumenBay.git
```

```bash
cd LumenBay
```

### 2. Set Up the Frontend

Open a terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

On GitHub Pages, the project home URL opens the Lumen Bay introduction first.
Choose **Open the simulator** to enter the interactive simulator.

### 3. Set Up the Backend

Open another terminal from the project root:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate it on Windows:

```powershell
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI server (adjust the module path if your backend entry point differs):

```bash
uvicorn app.main:app --reload --port 8001
```

Backend:

```text
http://127.0.0.1:8001
```

API documentation:

```text
http://127.0.0.1:8001/docs
```

**Note:** Ensure the frontend API configuration points to the running backend. Do not commit environment files containing credentials or private configuration.

---

## 🎯 What Makes LumenBay Different?

Traditional urban dashboards often display information about transportation, infrastructure and finances separately.

LumenBay focuses on the relationships between them.

| Traditional City Dashboard | LumenBay |
|---|---|
| Displays isolated metrics | Models interconnected systems |
| Reports existing conditions | Allows users to introduce scenarios |
| Shows individual statistics | Traces cause-and-effect relationships |
| Limited policy experimentation | Supports comparative interventions |
| Static infrastructure views | Interactive city visualization |
| Reports what happened | Explores what could happen next |

The objective is not simply to visualize a city, but to understand how decisions made in one part of the city can influence everything else.

## 🌱 Vision and Future Scope

LumenBay aims to evolve into a comprehensive urban decision-support platform.

Potential future enhancements include:

- Integration of real-world geographical and infrastructure datasets.
- More detailed 3D city environments.
- Real-time IoT sensor integration.
- AI-assisted urban policy recommendations.
- Advanced traffic and pedestrian simulations.
- Climate-risk and environmental modelling.
- More detailed district-level utility networks.
- Predictive analysis using historical urban data.
- Integration with smart-city management systems.

## 👥 Team and Development

**Project:** LumenBay — Fictional City Simulator

**Category:** Simulation & Digital Twins

**Domain:** Smart Cities, Urban Planning and Sustainable Development

**Developed by:** Team LumenBay

**Institution:** Don Bosco Institute of Technology, Bengaluru

**Event:** CodeQuest National Tech Hackathon 2026

The project combines frontend engineering, backend development, simulation logic, data visualization and urban systems thinking to explore a more connected approach to city planning.

## 📜 Credits and Acknowledgements

- Concept, architecture and development: Team LumenBay.
- UI/UX design and frontend implementation: Team LumenBay.
- Backend engineering and simulation development: Team LumenBay.
- Open-source libraries and third-party resources: Respective authors and contributors.

Third-party assets, libraries, fonts and design references retain their respective licences and attributions.

## 📄 License

This project is distributed under the licence specified in the repository's LICENSE file. Third-party components remain subject to their respective licences.

---

<p align="center">

**LumenBay**

*Every decision shapes a city. Every change creates a consequence.*

**Simulate. Understand. Transform.**

</p>
