const log = (text, name = 'unknown', timeout) => {
    const parent = document.querySelector('#events');
    const el = document.createElement('li')
    el.innerHTML = `${name}: ${text}`
    parent.appendChild(el);
    parent.scrollTop = parent.scrollHeight
    setTimeout(()=>{el.remove()}, timeout)
   }
   
const onChatSubmitted = (sock) => (e) =>{
       e.preventDefault();
       const input = document.querySelector('#chat');
       const text = input.value;
       input.value = ""
       sock.emit('message', text)
   };
   

const setUsername = (sock, seatnum) => (e) =>{
        e.preventDefault(); 
        const nameinput = document.querySelector(`#username${seatnum}`);
        const usernametext = nameinput.value;
        nameinput.value = ""
        sock.emit('username', usernametext)
        sock.emit('takeseat', seatnum)}


const reset = (sock) => (e) =>{
         e.preventDefault();
        sock.emit('reset')
        };


const start = (sock) => (e) =>{
        e.preventDefault();
        sock.emit('start')
        };

const bid = (sock) => (e) =>{
    e.preventDefault();
    sock.emit('bid')
    sock.emit('message', 'bids!')
    };








(()=>{

const sock = io();

sock.emit('message', 'new player has entered the lobby')
sock.emit('getseat')


sock.on('message', (text, username="Server", timeout=7000) => log(text, username, timeout))
sock.on('refresh', ()=> {location.reload()})

sock.on('bid', (biddingseat, bidamount) =>{
    let bidfield = document.querySelector('#bidfield')
    bidfield.innerHTML = bidamount
    document.querySelector('#highestbidderfield').innerHTML = biddingseat
})

sock.on('bidwinner', (username, seatnum, goldremaining, guysdrafted)=>{
    let winnersgold = document.querySelector(`#gold-field${seatnum}`)
    let winnersguys = document.querySelector(`#warrior-field${seatnum}`)
    winnersgold.innerHTML = goldremaining
    winnersguys.innerHTML = guysdrafted
    log(`${username} wins, they have ${goldremaining} remaining`)
})


sock.on('auctionround', (poppedguy)=>{
    const warriorname = document.querySelector('#warriornamefield')
    warriorname.innerHTML = poppedguy.name

    const warriordamage = document.querySelector('#warriordamagefield')
    warriordamage.innerHTML = poppedguy.damage

    const warriorhp = document.querySelector('#warriorhpfield')
    warriorhp.innerHTML = poppedguy.hp

    const warriorabilities = document.querySelector('#warriorabilitiesfield')
    warriorabilities.innerHTML = poppedguy.ability.abilityname

})

sock.on('takeseat', (players)=>{
for(let i=1; i<9; i++){
    if(players[i]){
        const namefield = document.querySelector(`#name-field${i}`)
        namefield.innerHTML = players[i].player

        const goldfield = document.querySelector(`#gold-field${i}`)
        goldfield.innerHTML = 200
    }
}})

document.querySelector('#resetform').addEventListener('submit', reset(sock));

document.querySelector('#start').addEventListener('submit', start(sock));

document.querySelector('#chat-form').addEventListener('submit', onChatSubmitted(sock));

document.querySelector('#bidbutton').addEventListener('submit', bid(sock));



for(let i=1; i<9; i++){
    document
    .querySelector(`#name-select${i}`)
    .addEventListener('submit', setUsername(sock, i)); 
}

    
})()

