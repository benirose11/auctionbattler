const http = require('http')
const express = require('express')
const app = express();
const socketio = require('socket.io')
const server = http.createServer(app);
const mongoose = require('mongoose');
const session = require('express-session');
const User = require('./models/user');
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy;;
const dbUrl = process.env.DB_URL || 'mongodb://localhost:27017/auctionbattler';
const account = require('./routes/accountroutes/account')
const flash = require('connect-flash')
const ExpressError = require('./utilities/utilities');

// const MongoDBStore = require('connect-mongo')(session)

const io = socketio(server)

const ejsMate = require('ejs-mate');

app.use(express.static(`${__dirname}/../client`))
app.use(express.urlencoded({extended: true}));
app.engine('ejs', ejsMate)
app.set('view engine', 'ejs');

mongoose.connect(dbUrl, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
console.log(`Database connection open using ${dbUrl}`);
});

// these are our session configurations to be used with app.use(session()). This all related to using cookies to remeber session information
const secret = process.env.SECRET || 'thisshouldbeabettersecret'
// const store = new MongoDBStore({
//     url: dbUrl,
//     secret: secret,
//     touchAfter: 24*60*60
// })

// store.on("error", function(e) {
//     console.log('session store error', e)
// })


const sessionConfig = {
    // store: store,
    name: 'auctionbattlercookie',
    secret: secret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        // secure: true,
        expires: Date.now() + 1000 * 60 * 60 *24 * 7,
        maxAge: 1000 * 60 * 60 *24 * 7,}}

//sesssion gives sends a cookie so we can have a session object to modify. flash lets  enables us to flash messages
app.use(session(sessionConfig));
app.use(flash());
passport.use(new LocalStrategy(User.authenticate()));
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) =>{
    res.locals.currentUser = req.user;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error')
    next()
})

//page view routes
app.get('/home', (req, res) => {
    res.render('../views/pages/home')})

app.get('/login', (req, res) => {
    res.render('../views/pages/login')})

app.get('/signup', (req, res) => {
    res.render('../views/pages/signup')})

app.get('/lobby', (req,res) => {
    res.render('../views/pages/lobby')})

//account routes
app.get('/logout', account.logout)
app.post('/register', account.register)
app.post('/login', passport.authenticate('local', {failureFlash: true, failureRedirect: '/login'}), account.login)


app.use((err, req, res, next) => {
    const { statusCode = 500 } = err;
    if (!err.message) err.message = 'Oh No, Something Went Wrong!'
    res.status(statusCode).render('error', { err })
})


//game mechanics and objects
let players = {}
let warriorlist = []
let turnorder = []
let playersocks = {}
let maxbid = 0
let guyontheblock = [];


const specialpropsobj = {

0:{'abilityname':'Damage Aura 50%','code': (melee, pierce, magic, defense) =>{
    melee = melee * 1.5
    pierce = pierce * 1.5
    magic = magic * 1.5
    return {melee, pierce, magic, defense} 
}, 'propskey':0},


1:{'abilityname':'Defense Aura 30%','code': (melee, pierce, magic, defense) =>{
    defense = defense * 1.3
    return {melee, pierce, magic, defense} 
},'propskey':1},

2:{'abilityname':'Magical amplifier, if you have at least 100 magic damage, +250 magic damage','code': (melee, pierce, magic, defense) =>{
    if(magic >= 100) magic = magic + 250
    return {melee, pierce, magic, defense} 
},'propskey':2}


}

const lamepropsobj = {

    0:{'abilityname':'Melee damage aura 15%','code': (melee, pierce, magic, defense) =>{
        melee = Math.floor(melee*1.15)
        return {melee, pierce, magic, defense}
    }, 'propskey':0},

    1:{'abilityname':'Piercing melee weapons, 100% team melee damage converted to piercing','code': (melee, pierce, magic, defense) =>{
        pierce = melee + pierce
        melee = 0
        return {melee, pierce, magic, defense} 
    }, 'propskey':1},

    2:{'abilityname':'Glass Cannon, melee damage reduced 85%, magic+ranged damage +50%, defense -10%','code': (melee, pierce, magic, defense) =>{
        melee = melee*.15
        pierce = pierce * 1.5
        magic = magic * 1.5
        defense = defense * .9
        return {melee, pierce, magic, defense} 
        
    }, 'propskey':2},

}

const noabilityobj = {
    'abilityname':'None',
    'code': (melee, pierce, magic, defense) => {return {melee, pierce, magic, defense}},
    'propskey': null
}

const abilitygenerator = (chanceforlame, chanceforspecial) =>{
    let luckryroll = Math.random() * 100
    let special = specialpropsobj[Math.floor(Math.random() * Object.keys(specialpropsobj).length)]
    let lame = lamepropsobj[Math.floor(Math.random() * Object.keys(lamepropsobj).length)]
    if(luckryroll<chanceforspecial){return special} else {luckryroll - special}
    if(luckryroll<chanceforlame){return lame} else return noabilityobj

}

const calcmods = (melee, pierce, magic, def, abilityorder) =>{
    console.log('calcmods recieved', melee, pierce, magic, def, abilityorder,)
if(abilityorder.length === 0) return {melee, pierce, magic, def}
let mod = abilityorder.pop()
var {melee, pierce, magic, defense} = mod.code(melee, pierce, magic, def)
// let {meleedmg, piercedmg, magicdmg, defense} = mod.code(melee, pierce, magic, def)
    console.log('calcmods vals after running func', melee, pierce, magic, defense)
return calcmods(melee, pierce, magic, defense, abilityorder)
}

class playerobject {
    constructor(username, seatnum){
        this.player = username
        this.seat = seatnum
        this.gold = 200
        this.starters = []
        this.allguys = []
        
    }
}


class warrior {
    constructor(name){
        this.name = 'Warrior ' + `${name}`
        this.hp = 50 + Math.floor(Math.random() * 50)
        this.damage = 20 + Math.floor(Math.random() * 60)
        this.damagetype = 'melee'
        this.ability = noabilityobj
        
        }
}

class archer {
    constructor(name){
        this.name = 'Archer ' + `${name}`
        this.hp = 10 + Math.floor(Math.random() * 50)
        this.damage = 70 + Math.floor(Math.random() * 50)
        this.damagetype = 'piercing'
        this.ability = abilitygenerator(25, 5)      
        }


}

class mage {
    constructor(name){
        this.name = 'Mage ' + `${name}`
        this.hp = 10 + Math.floor(Math.random() * 40)
        this.damage = 25 + Math.floor(Math.random() * 40)
        this.damagetype = 'magic'
        // this.ability = abilitygenerator(60, 25) 
        this.ability = lamepropsobj[2]
        }

}

class commander {
    constructor(name){
        this.name = 'Commander ' + `${name}`
        this.hp = 1 + Math.floor(Math.random() * 99)
        this.damage = 1 + Math.floor(Math.random() * 99)
        this.damagetype = 'melee'
        this.ability = abilitygenerator(21, 80) 
        
        }

}



// IO routes and functions
io.on('connection', (sock)=>{
    let username = 'player'
    let seat = null
    sock.emit('message', "you are connected")

sock.on('message', (text) => io.emit('message',text, username))

sock.on('getseat', ()=>{sock.emit('takeseat', players)})

sock.on('reset', ()=>{
    players = {}
    turnorder = []
    warriorlist = []
    maxbid=0
    guyontheblock = []
    io.emit('refresh')
})

sock.on('takeseat', (seatnum) => {
    let playerobj = new playerobject(username, seatnum)
    seat = seatnum
    playersocks[seatnum] = sock
    players[seatnum] = playerobj
    io.emit('message', `${username} has taken seat ${seatnum}`)
    io.emit('takeseat', players)
})
 
sock.on('start', ()=>{
    turnorder = []
    warriorlist = []
    maxbid=0
    guyontheblock = []
    let numplayers = Object.keys(players).length
    for(let key in players){
       turnorder.push(players[key].seat) 
    }
    io.emit('message', `round starting, please do not refresh unil completed! playing with ${numplayers} players`)
    for(let i=0; i<(numplayers*2); i++){
        let dudegenerator = Math.random() * 100 
        let guy;
        if(dudegenerator < 35) guy = new warrior(`${i+1}`)
        else if(dudegenerator < 65) guy = new archer(`${i+1}`)
        else if(dudegenerator < 85) guy = new mage(`${i+1}`)
        else guy = new commander(`${i+1}`)
        warriorlist.push(guy)
        }
    guyontheblock.push(warriorlist.pop())
    io.emit('auctionround', guyontheblock[0])        
    let activeseat = turnorder.pop()
    activeplayer = players[activeseat].player
    io.emit('bid', activeplayer, bidamount=1)
    maxbid = 1
    countdown(5000, maxbid, activeseat)
    turnorder.unshift(activeseat)    

})

sock.on('username', (usernametext) => {
    username = usernametext
})


sock.on('bid', ()=>{
    maxbid ++;
    let bid = maxbid
    io.emit('bid', username, maxbid, 3000)
    countdown(2000, bid, seat)
})  

const countdown = (timeout, bidamount, activeseat) => {
    if(timeout === 0) {
        players[activeseat].gold = (players[activeseat].gold - bidamount)
        players[activeseat].allguys.push(guyontheblock.pop())
        io.emit('bidwinner', players[activeseat].player, activeseat, players[activeseat].gold, players[activeseat].allguys.length)   
        if(warriorlist.length === 0){ 
            console.log('calling calcwinners with', players)
            return calcwinner(players)  }
        return callnext()
    }
    setTimeout(()=>{
        if(bidamount === maxbid){
            io.emit('message', `${players[activeseat].player} is currently winning with ${(timeout/1000)} seconds left`, 'server', 3000)
            countdown((timeout - 1000), bidamount, activeseat)}
    }, 1000)

}



const calcwinner = (winningplayers, timesthrough=0) => {
    console.log('calcwinners called with', winningplayers, timesthrough)
    let winners = []
    let resultsobj = {}
    let highestseen = 0
    
    if(timesthrough > 2){return  io.emit('message', `game ends in a tie...`, 'Server', 20000)} 
     
    for(let key in winningplayers){
        let meleedmg = 0;
        let piercedmg = 0;
        let magicdmg = 0
        let defense = 0
        let abilityorder = []
        for(let guy of winningplayers[key].allguys){
            if(guy.damagetype === 'melee') meleedmg += guy.damage
            if(guy.damagetype === 'piercing') piercedmg += guy.damage
            if(guy.damagetype === 'magic') magicdmg += guy.damage
            defense += guy.hp
            abilityorder.push(guy.ability)
        }
    var {melee, pierce, magic, def} = calcmods(meleedmg, piercedmg, magicdmg, defense, abilityorder)
    let totescore = melee + pierce + magic + def
    resultsobj[key] = totescore
    if(totescore === highestseen){
        winners.push(winningplayers[key])} 
    else if(totescore > highestseen){
        highestseen = totescore
        winners = []
        winners.push(winningplayers[key])}
}
console.log('should be checking to see if winners length is one', winners)
if(winners.length === 1){
    return io.emit('message', `${winners[0].player} wins!!!`, 'Server', 20000)
} else {
    io.emit('message', `Round tie. Calculating winners round`, 'Server', 20000)
    let newplayersobj = {}
    for(index in winners){
        newplayersobj[index] = winners[index]
    }

    timesthrough ++
    return calcwinner(newplayersobj, timesthrough)
}
 


}










// old win condition, not used currently.
const draftover = (winningplayers, timesthrough=0) =>{
    console.log(winningplayers, timesthrough)
    let calcdamagearr = []
    let resultsobj = {}
    if(timesthrough > 2){return  io.emit('message', `game ends in a tie...`, 'Server', 20000)} 
     
    for(let key in winningplayers){
        let playerdamage = 0;
        let playerhp = 0;
        for(let guy of winningplayers[key].allguys){
            playerdamage += guy.damage
            playerhp += guy.hp
        }
        winningplayers[key]['dmgcalc'] = playerdamage 
        winningplayers[key]['hpcalc'] = playerhp     
        calcdamagearr.push([playerdamage, playerhp])
     }

for(let key in winningplayers){
let wins = 0
let losses = -1
for(let opponent of calcdamagearr){
    let hometotal = winningplayers[key].dmgcalc % opponent[1]
    let awaytotal = opponent[0] % winningplayers[key].hpcalc
    if(hometotal > awaytotal){wins ++} else {losses ++}
}
winningplayers[key]['winloss'] = [wins,losses]
resultsobj[key] = [wins - losses, wins, losses]
}

let highestseen = 0
let winners = []

for(let key in resultsobj){
    io.emit('message', `${winningplayers[key].player} had ${resultsobj[key][1]} wins and ${resultsobj[key][2]} losses`, 'Server', 10000)
    if(resultsobj[key][0] === highestseen){winners.push(winningplayers[key])}
    if(resultsobj[key][0] > highestseen){
        winners = []
        highestseen = resultsobj[key][0]
        winners.push(winningplayers[key])
    }
}


if(winners.length === 1){
    io.emit('message', `${winners[0].player} wins!!!`, 'Server', 20000)
} else {
    io.emit('message', `Round tie. Calculating winners round`, 'Server', 20000)
    let newplayersobj = {}
    for(index in winners){
        newplayersobj[index] = winners[index]
    }
    timesthrough ++
draftover(newplayersobj, timesthrough)


}

}


const callnext = () => {
guyontheblock.push(warriorlist.pop())
io.emit('auctionround', guyontheblock[0]) 
let activeseat = turnorder.pop()
activeplayer = players[activeseat].player
io.emit('bid', activeplayer, bidamount=1)
maxbid = 1
countdown(2000, maxbid, activeseat)
turnorder.unshift(activeseat)  
}




})


app.get("*", (req,res)=>{
    res.render('../views/pages/home')
})

server.on('error', (err) =>{
    console.error(err)})

server.listen(8080, () => {
    console.log('serving on 8080')}) 