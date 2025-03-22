const back = document.getElementById('back');
const forward = document.getElementById('forward');
const refresh = document.getElementById('refresh');
const addressBar = document.getElementById('controls').querySelector('input');
const display = document.getElementById('display');

back.addEventListener('click', () => {
    window.history.back();
});

forward.addEventListener('click', () => {
    window.history.forward();
});

refresh.addEventListener('click', () => {
    display.src = display.src;
});

addressBar.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        display.src = addressBar.value;
    }
}); 