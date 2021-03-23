const User = require('../../models/user');
// const {cloudinary} = require('../cloudinary')


module.exports.logout = (req, res) => {
    req.logout();
    req.flash('success', 'Logged out')
    res.redirect('/home')}

module.exports.register = async (req, res, next)=>{
    console.log(req.body)
    try {
        const {email, username, password} = req.body
        const newuser = await new User({email, username})
        const registereduser = await User.register(newuser, password);
        req.login(registereduser, err => {
            if(err) return next(err)
        });
        req.flash('success', 'Welcome to Auction Battler')
        res.redirect('/home')
        }
        catch(e){
            req.flash('error', e.message)
            res.redirect('/home')
        }}

module.exports.login = (req, res)=>{
    req.flash('success', 'Logged in');
    const targeturl = req.session.returnto || '/home';
    delete req.session.returnto;        
    res.redirect(targeturl)}

