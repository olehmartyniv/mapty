'use strict';

class Workout {
  date = new Date();
  id = (Date.now() + '').slice(-10);
  clicks = 0;

  constructor(coords, distance, duration) {
    this.coords = coords; // [lat, lng]
    this.distance = distance; // in km
    this.duration = duration; // in min
  }

  _setDescription() {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[this.date.getMonth()]
    } ${this.date.getDate()}`;
  }

  click() {
    this.clicks++;
  }
}

class Running extends Workout {
  type = 'running';

  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.#calcPace();
    this._setDescription();
  }

  #calcPace() {
    // min/km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling';

  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.#calcSpeed();
    this._setDescription();
  }

  #calcSpeed() {
    // km/h
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

///////////////////////////////////////
// APPLICATION ARCHITECTURE
const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const containerBtns = document.querySelector('.btns');
const editWorkout = document.querySelector('.workout__edit');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const error = document.querySelector('.error');
const closeError = document.querySelector('.error__btn--close');
const confirmModal = document.querySelector('.confirm');
const confirmButton = document.querySelector('.confirm__btn');
const cancelButton = document.querySelector('.cancel__btn');
const overlay = document.querySelector('.overlay');

class App {
  #map;
  #mapZoomLevel = 13;
  #mapEvent;
  #workouts = [];
  #markerGroup;
  #sorted = false;
  #workoutToDelete;
  #editedWorkoutIndex;

  constructor() {
    // Get user's position
    this.#getPosition();

    // Get data from local storage
    this.#getLocalStorage();

    // Show buttons if workouts exist
    this.#showHideBtns();

    // Attach event handlers
    form.addEventListener('submit', this.#newWorkout.bind(this));
    inputType.addEventListener('change', this.#toggleElevationField);
    containerWorkouts.addEventListener('click', this.#moveToPopup.bind(this));
    containerWorkouts.addEventListener('click', this.#showEditForm.bind(this));
    containerWorkouts.addEventListener(
      'click',
      this.#openDeleteConfirmationModal.bind(this)
    );
    containerBtns.addEventListener(
      'click',
      this.#openDeleteConfirmationModal.bind(this)
    );
    containerBtns.addEventListener('click', this.#sortWorkouts.bind(this));
    closeError.addEventListener('click', this.#closeModal.bind(this, error));
    confirmButton.addEventListener('click', this.#confirmDeletion.bind(this));
    cancelButton.addEventListener(
      'click',
      this.#closeModal.bind(this, confirmModal)
    );
    overlay.addEventListener('click', this.#closeModal.bind(this, overlay));
  }

  #getPosition() {
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition(
        this.#loadMap.bind(this),
        this.#showErrorModal.bind(this, 'Could not get your position!')
      );
  }

  #loadMap(position) {
    const { latitude, longitude } = position.coords;
    const coords = [latitude, longitude];

    this.#map = L.map('map');
    this.#markerGroup = new L.FeatureGroup().addTo(this.#map);

    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    // Handling clicks on map
    this.#map.on('click', this.#showForm.bind(this));

    this.#workouts.forEach(work => {
      this.#renderWorkoutMarker(work);
    });

    // Show the geolocation or fit map to show all markers
    if (this.#markerGroup.getLayers().length === 0) {
      this.#map.setView(coords, this.#mapZoomLevel);
    } else {
      this.#map.fitBounds(this.#markerGroup.getBounds());
    }
  }

  #showErrorModal(errorMessage) {
    error.classList.toggle('invisible');
    overlay.classList.toggle('invisible');
    error.querySelector('.error__header').textContent = errorMessage;
  }

  #openDeleteConfirmationModal(event) {
    const deleteEl = event.target;
    if (
      !deleteEl ||
      (deleteEl.className !== 'btn btn__delete--all' &&
        deleteEl.className !== 'workout__delete')
    )
      return;

    // Generate confirmation message
    let question = 'Are you sure you want to delete ';

    if (deleteEl.className === 'btn btn__delete--all') {
      this.#workoutToDelete = null;
      question += 'all workouts?';
    } else if (deleteEl.className === 'workout__delete') {
      this.#workoutToDelete = deleteEl.closest('.workout');
      question += 'this workout?';
    } else {
      return;
    }

    // Show confirmation modal
    confirmModal.querySelector('.confirm__header').textContent = question;
    confirmModal.classList.toggle('invisible');
    overlay.classList.toggle('invisible');
  }

  #closeModal(modal) {
    modal.classList.toggle('invisible');
    overlay.classList.toggle('invisible');
  }

  #showForm(mapE) {
    // Empty inputs
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        '';

    this.#mapEvent = mapE;
    form.classList.remove('hidden');
    inputDistance.focus();
  }

  #showEditForm(event) {
    const workoutEl = event.target.closest('.workout');

    if (!workoutEl || event.target.className !== 'workout__edit') return;

    form.classList.remove('hidden');
    inputDistance.focus();

    // Get workout data
    const workout = this.#workouts.find(
      work => work.id === workoutEl.dataset.id
    );

    // Render workout form with data
    inputType.value = workout.type;
    inputDistance.value = workout.distance;
    inputDuration.value = workout.duration;
    if (workout.type === 'running') inputCadence.value = workout.cadence;
    if (workout.type === 'cycling')
      inputElevation.value = workout.elevationGain;

    this.#toggleElevationField();
    this.#editedWorkoutIndex = this.#workouts.findIndex(
      work => work.id === workout.id
    );
  }

  #hideForm() {
    // Empty inputs
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        '';

    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => (form.style.display = 'grid'), 1000);
  }

  #showHideBtns() {
    setTimeout(
      () =>
        (containerBtns.style.display =
          this.#workouts.length !== 0 ? 'block' : 'none'),
      250
    );
  }

  #toggleElevationField() {
    if (inputType.value === 'running') {
      inputElevation.closest('.form__row').classList.add('form__row--hidden');
      inputCadence.closest('.form__row').classList.remove('form__row--hidden');
    }
    if (inputType.value === 'cycling') {
      inputElevation
        .closest('.form__row')
        .classList.remove('form__row--hidden');
      inputCadence.closest('.form__row').classList.add('form__row--hidden');
    }
  }

  #newWorkout(event) {
    const validInputs = (...inputs) =>
      inputs.every(input => Number.isFinite(input));
    const allPositive = (...inputs) => inputs.every(input => input > 0);

    event.preventDefault();

    // Get data from form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;

    let lat, lng;
    if (this.#editedWorkoutIndex === undefined)
      ({ lat, lng } = this.#mapEvent.latlng);
    else [lat, lng] = this.#workouts[this.#editedWorkoutIndex].coords;

    let workout;

    // If workout running, create running object
    if (type === 'running') {
      const cadence = +inputCadence.value;

      // Check if data is valid
      if (
        !validInputs(distance, duration, cadence) ||
        !allPositive(distance, duration, cadence)
      )
        return this.#showErrorModal('Inputs have to be posistive numbers!');

      workout = new Running([lat, lng], distance, duration, cadence);
    }

    // If workout cycling, create cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;

      if (
        !validInputs(distance, duration, elevation) ||
        !allPositive(distance, duration, elevation)
      )
        return this.#showErrorModal('Inputs have to be posistive numbers!');

      workout = new Cycling([lat, lng], distance, duration, elevation);
    }

    //
    if (this.#editedWorkoutIndex >= 0) {
      this.#editWorkout(workout);
      return;
    }

    // Add new object to workout array
    this.#workouts.push(workout);

    // Render workout on map as marker
    this.#renderWorkoutMarker(workout);

    // Render workout on list
    this.#renderWorkout(workout);

    // Hide form and clear input fields
    this.#hideForm();

    // Hide container buttons if needed
    this.#showHideBtns();

    // Set to local storage all workouts
    this.#setLocalStorage();
  }

  #editWorkout(workout) {
    // Copy old data
    workout.id = this.#workouts[this.#editedWorkoutIndex].id;
    workout.description = this.#workouts[this.#editedWorkoutIndex].description;
    workout.date = this.#workouts[this.#editedWorkoutIndex].date;
    workout.markerId = this.#workouts[this.#editedWorkoutIndex].markerId;

    // Save new workout data
    this.#workouts[this.#editedWorkoutIndex] = workout;

    // Hide form and clear input fields
    this.#editedWorkoutIndex = undefined;
    this.#hideForm();

    // Delete all elements from list
    this.#deleteAllWorkoutElements();

    // Render all elements
    this.#renderAllWorkoutElements();

    // Set to local storage all workouts
    this.#setLocalStorage();
  }

  #renderWorkoutMarker(workout) {
    workout.markerId = L.marker(workout.coords)
      .addTo(this.#map)
      .addTo(this.#markerGroup)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${workout.description}`
      )
      .openPopup()._leaflet_id;
  }

  #renderWorkout(workout) {
    let html = `
    <li class="workout workout--${workout.type}" data-id="${workout.id}">
    <h2 class="workout__title">${workout.description}
      <span class="workout__delete">❌</span>
      <span class="workout__edit">✏️</span>
    </h2>
    <div class="workout__details">
      <span class="workout__icon">${
        workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'
      }</span>
      <span class="workout__value">${workout.distance}</span>
      <span class="workout__unit">km</span>
    </div>
    <div class="workout__details">
      <span class="workout__icon">⏱</span>
      <span class="workout__value">${workout.duration}</span>
      <span class="workout__unit">min</span>
    </div>
    <div class="workout__details">
      <span class="workout__icon">⚡️</span>
      <span class="workout__value">${
        workout.type === 'running'
          ? workout.pace.toFixed(1)
          : workout.speed.toFixed(1)
      }</span>
      <span class="workout__unit">${
        workout.type === 'running' ? 'min/km' : 'km/h'
      }</span>
      </div>
    <div class="workout__details">
      <span class="workout__icon">${
        workout.type === 'running' ? '🦶🏼' : '⛰'
      }</span>
      <span class="workout__value">${
        workout.type === 'running' ? workout.cadence : workout.elevationGain
      }</span>
      <span class="workout__unit">${
        workout.type === 'running' ? 'spm' : 'm'
      }</span>
    </div>
  </li>
      `;

    form.insertAdjacentHTML('afterend', html);
  }

  #renderAllWorkoutElements() {
    // Sort and render all workouts
    let workoutsToRender;

    if (this.#sorted)
      workoutsToRender = this.#workouts
        .slice()
        .sort((a, b) => a.distance - b.distance);
    else workoutsToRender = this.#workouts.slice();

    workoutsToRender.forEach(workout => this.#renderWorkout(workout));
  }

  #deleteWorkout() {
    // Get workout data
    const workout = this.#workouts.find(
      work => work.id === this.#workoutToDelete.dataset.id
    );

    // Delete workout
    this.#workouts.splice(
      this.#workouts.findIndex(work => work.id === workout.id),
      1
    );

    // Delete element from list
    this.#workoutToDelete.remove();

    // Delete pin from map
    this.#markerGroup.removeLayer(workout.markerId);

    // Hide form and container buttons if needed
    this.#showHideBtns();
    this.#hideForm();

    // Set remaining workouts to local storage
    this.#setLocalStorage();
  }

  #deleteAllWorkouts() {
    // Delete all workouts
    this.#workouts = [];

    // Delete all elements from list
    this.#deleteAllWorkoutElements();

    // Delete all pins from map
    this.#markerGroup.clearLayers();

    // Hide form and container buttons if needed
    this.#showHideBtns();
    this.#hideForm();

    // Clear workouts from local storage
    this.#setLocalStorage();
  }

  #confirmDeletion() {
    if (this.#workoutToDelete) this.#deleteWorkout();
    else this.#deleteAllWorkouts();

    this.#closeModal(confirmModal);
  }

  #sortWorkouts(event) {
    const btnEl = event.target;

    if (!btnEl || btnEl.className !== 'btn btn__sort') return;

    // Switch sorting value
    this.#sorted = this.#sorted ? false : true;

    // Delete all elements from list
    this.#deleteAllWorkoutElements();

    // Render all elements
    this.#renderAllWorkoutElements();
  }

  #deleteAllWorkoutElements() {
    let element;
    while ((element = form.nextSibling)) {
      element.remove();
    }
  }

  #moveToPopup(event) {
    // BUGFIX: When we click on a workout before the map has loaded, we get an error. But there is an easy fix:
    if (!this.#map) return;

    const workoutEl = event.target.closest('.workout');

    if (!workoutEl) return;

    const workout = this.#workouts.find(
      work => work.id === workoutEl.dataset.id
    );

    this.#map.setView(workout.coords, this.#mapZoomLevel, {
      animate: true,
      pan: {
        duration: 1,
      },
    });

    // Using the public interface
    workout.click();
  }

  #setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }

  #getLocalStorage() {
    const data = JSON.parse(localStorage.getItem('workouts'));

    data.forEach(item => {
      let workout;

      if (item.type === 'running') workout = new Running();
      if (item.type === 'cycling') workout = new Cycling();
      Object.assign(workout, item);

      this.#workouts.push(workout);
    });

    this.#renderAllWorkoutElements();
  }

  reset() {
    localStorage.removeItem('workouts');
    location.reload();
  }
}

const app = new App();
