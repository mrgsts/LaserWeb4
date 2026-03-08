import React from 'react';
import { connect } from 'react-redux';
import { Form, Button, InputGroup, ButtonGroup, ButtonToolbar} from 'react-bootstrap'
import Icon from './font-awesome';

import { addMachineProfile, delMachineProfileId } from '../actions/settings';
import { importMaterialDatabase } from '../actions/material-database';

import stringify from 'json-stringify-pretty-compact';
import slug from 'slug'

import { alert, prompt, confirm} from './laserweb';
import CommandHistory from '../components/command-history'

import { validate } from '../reducers/material-database'

class MachineProfile extends React.Component {
    
    constructor(props)
    {
        super(props);
        this.handleApply.bind(this);
        this.handleSelect.bind(this);
        this.handleInput.bind(this);
        let selected = this.props.settings.__selectedProfile || "";
        
        this.state={selected: selected , newLabel: '', newSlug:''}
    }
    
    handleApply(e) {
       let selected=this._getSelectedProfile()
       let profileId = this.state.selected
       if (selected) {
            confirm("Are you sure? Current settings will be overwritten.",(b)=>{
                if (b) this.props.onApply({...selected.settings , __selectedProfile: profileId });
                try {
                    let mdb = require('../data/lw.materials/materials/'+profileId.replace("*","")+".json")
                        if (validate(mdb)){
                            if (mdb) {
                                confirm(`A material database related with ${profileId} has been detected. Do you want to load it?`,(data)=>{
                                    if (data) this.props.dispatch(importMaterialDatabase(profileId,mdb));
                                })
                            }
                        } else {
                            CommandHistory.dir(`Material database bundle ${profileId} found corrupt. Please open an issue.`,validate.errors, 2)
                        }
                } catch(e) {

                }
            })
       }
       return ;
    }
    
    handleSelect(e){
        let value=e.target.value
        if (value) this.setState({selected: value});
        
    }
    
    handleDelete(e){
        this.props.dispatch(delMachineProfileId(this.state.selected));
        this.setState({selected: '', newLabel:'', newSlug:''})
    }
    
    handleSave(e) {
        let currentProfile = this._getSelectedProfile();
        if (currentProfile) this.props.dispatch(addMachineProfile(this.state.selected, {...currentProfile, settings: this.props.settings}))
    }
    
    handleAppend(e){
        if (this.state.newLabel.trim().length)
            this.props.dispatch(addMachineProfile(this.state.newSlug, {machineLabel: this.state.newLabel, settings: this.props.settings}))
            
        this.setState({selected: this.state.newSlug})
        
    }
    
    handleInput(e){
        this.setState({newLabel: e.target.value, newSlug: slug(e.target.value)})
    }
    
    _getSelectedProfile()
    {
        if(typeof this.props.profiles[this.state.selected]!=="undefined")
            return this.props.profiles[this.state.selected];
        
        return undefined;
    }

    render(){
        
        let profileOptions=[];
        let description;
        let selected;
        const disabledApply = !this.state.selected.length
        const disabledDelete= disabledApply || (this.props.profiles[this.state.selected] && this.props.profiles[this.state.selected]._locked)
        
        
        Object.keys(this.props.profiles).forEach((key) => {
            let profile=this.props.profiles[key];
            profileOptions.push(<option key={key} value={key} >{profile.machineLabel}</option>);
        });
        
        
        if (selected=this._getSelectedProfile()){
            let settings=stringify(this.props.profiles[this.state.selected].settings);
            let machinedesc=this.props.profiles[this.state.selected].machineDescription;
            description=(<details><summary>{machinedesc? machinedesc : "Details" }</summary><pre>{settings}</pre></details>);
        }
        
        return (
            
                <div>
                <Form.Group controlId="formControlsSelect">
                    <h5>Apply predefined machine profile</h5>
                    {this.state.selected ? (<small>Machine Id: <code>{this.state.selected}</code></small>):undefined}
                    <Form.Select onChange={(e)=>{this.handleSelect(e)}} value={this.state.selected} ref="select" className="full-width">
                      <option value="">Select a Machine Profile</option>
                      {profileOptions}
                    </Form.Select>
                    
                    <ButtonGroup>
                        <Button className="btn btn-sm btn-info" onClick={(e)=>{this.handleApply(e)}} disabled={disabledApply} title="Applies selected profile"><Icon name="share" /> Apply</Button>
                        <Button className="btn btn-sm btn-warning" onClick={(e)=>{this.handleSave(e)}} title="Updates selected profile with current configuration" disabled={disabledDelete}><Icon name="pencil" /> Update</Button>
                        <Button className="btn btn-sm btn-danger" onClick={(e)=>{this.handleDelete(e)}} title="Delete selected profile" disabled={disabledDelete}><Icon name="trash" /> Delete</Button>
                    </ButtonGroup>
                     <small className="form-text text-muted">Use this dialog to apply predefined machine settings. This settings will override current settings. Use with caution.</small>
                    {description}
                    </Form.Group>
                    
                    <Form.Group controlId="formControlsAppend">
                   
                    <h5>New profile</h5>
                    {this.state.newSlug ? (<small>Machine Id: <code>{this.state.newSlug}</code></small>):undefined}
                     <InputGroup>
                        
                        <Form.Control type="text" onChange={(e)=>{this.handleInput(e)}} ref="newLabel" value={this.state.newLabel}/>
                        <Button variant="success" disabled={!this.state.newLabel.trim().length} onClick={(e)=>{this.handleAppend(e)}}><Icon name="plus" /></Button>
                     </InputGroup>
                     
                    <small className="form-text text-muted">Use this dialog to add the current settings to a new profile.</small>
                </Form.Group>
                </div>
            
            
           
            
        )
        
        
    }
    
    
}
 
 
const mapStateToProps = (state) => {
  return {
    profiles: state.machineProfiles,
    settings: state.settings
  }
};
 
export {MachineProfile}
export default connect(mapStateToProps)(MachineProfile);